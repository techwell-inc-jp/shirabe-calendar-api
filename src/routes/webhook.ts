/**
 * Stripe Webhook自動処理（Phase 4）
 *
 * POST /webhook/stripe
 * - auth/rate-limit ミドルウェアをバイパス
 * - Stripe 署名検証のみ（Web Crypto API の HMAC SHA-256）
 *
 * 処理対象イベント:
 * - checkout.session.completed  → APIキー登録、各種マッピング作成
 * - invoice.payment_failed      → status を "suspended" に変更
 * - invoice.payment_succeeded   → suspended なら "active" に復帰
 * - customer.subscription.deleted → plan を "free" に降格、Stripe情報削除
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/env.js";
import type { ApiKeyInfo } from "../middleware/auth.js";

const webhook = new Hono<AppEnv>();

// ─── Stripe 署名検証 ───────────────────────────────────────

/**
 * Stripe-Signature ヘッダーからタイムスタンプと署名を抽出する
 */
function parseStripeSignature(header: string): { timestamp: string; signatures: string[] } {
  const parts = header.split(",");
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of parts) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = value;
    if (key === "v1") signatures.push(value);
  }
  return { timestamp, signatures };
}

/**
 * HMAC SHA-256 で期待される署名を計算する
 */
async function computeHmacSha256(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * タイミングセーフな文字列比較
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

/** 署名の有効期間（5分） */
const SIGNATURE_TOLERANCE_SEC = 300;

/**
 * Stripe Webhook 署名を検証する
 *
 * @returns true なら検証成功
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string
): Promise<boolean> {
  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  // タイムスタンプの妥当性チェック
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > SIGNATURE_TOLERANCE_SEC) return false;

  // 署名計算
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = await computeHmacSha256(webhookSecret, signedPayload);

  // v1 署名のいずれかが一致すればOK
  return signatures.some((sig) => timingSafeEqual(sig, expected));
}

// ─── イベントハンドラー ───────────────────────────────────────

/**
 * checkout.session.completed 処理
 *
 * - KV API_KEYS にAPIキー登録
 * - stripe:customer-map 更新
 * - stripe-reverse 登録
 * - email 登録
 *
 * ※ checkout-pending は削除しない。/checkout/success ページが pending から
 *   APIキー平文を取得するため、Webhook と success ページの競合で「APIキーが
 *   表示されない」不具合が発生する。pending は TTL 1時間で自動失効する。
 */
async function handleCheckoutCompleted(
  event: any,
  apiKeysKV: KVNamespace,
  usageLogsKV: KVNamespace
): Promise<void> {
  const session = event.data.object;
  const apiKeyHash: string | undefined = session.metadata?.apiKeyHash;
  const plan: string | undefined = session.metadata?.plan;
  const stripeCustomerId: string | undefined = session.customer;
  const stripeSubscriptionId: string | undefined = session.subscription;

  if (!apiKeyHash || !plan) {
    console.error("checkout.session.completed: missing metadata (apiKeyHash or plan)");
    return;
  }

  // checkout-pending からAPIキー平文+email を取得
  const pendingStr = await usageLogsKV.get(`checkout-pending:${apiKeyHash}`);
  if (!pendingStr) {
    console.error("checkout.session.completed: checkout-pending not found for hash:", apiKeyHash);
    return;
  }
  const pending = JSON.parse(pendingStr) as { apiKey: string; plan: string; email: string };

  // customerId を生成（shrb_key ベース）
  const customerId = `cust_${apiKeyHash.slice(0, 16)}`;

  // 1. KV API_KEYS に登録
  const keyInfo: ApiKeyInfo = {
    plan: plan as ApiKeyInfo["plan"],
    customerId,
    stripeCustomerId,
    stripeSubscriptionId,
    email: pending.email,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  await apiKeysKV.put(apiKeyHash, JSON.stringify(keyInfo));

  // 2. stripe:customer-map 更新
  if (stripeCustomerId) {
    const mapStr = await usageLogsKV.get("stripe:customer-map");
    const map = mapStr ? JSON.parse(mapStr) : {};
    map[customerId] = { stripeCustomerId };
    await usageLogsKV.put("stripe:customer-map", JSON.stringify(map));
  }

  // 3. stripe-reverse 登録
  if (stripeCustomerId) {
    await usageLogsKV.put(
      `stripe-reverse:${stripeCustomerId}`,
      `${customerId},${apiKeyHash}`
    );
  }

  // 4. email 登録
  if (pending.email) {
    await usageLogsKV.put(`email:${pending.email}`, apiKeyHash);
  }

  // 5. checkout-pending は削除しない（/checkout/success ページとの競合回避）
  //    TTL 1時間で自動失効。
}

/**
 * Stripe Customer ID から KV の逆引きで customerId と apiKeyHash を取得する
 */
async function lookupByStripeCustomer(
  stripeCustomerId: string,
  usageLogsKV: KVNamespace
): Promise<{ customerId: string; apiKeyHash: string } | null> {
  const reverseStr = await usageLogsKV.get(`stripe-reverse:${stripeCustomerId}`);
  if (!reverseStr) return null;
  const [customerId, apiKeyHash] = reverseStr.split(",", 2);
  if (!customerId || !apiKeyHash) return null;
  return { customerId, apiKeyHash };
}

/**
 * invoice.payment_failed 処理 — status を "suspended" に
 */
async function handlePaymentFailed(
  event: any,
  apiKeysKV: KVNamespace,
  usageLogsKV: KVNamespace
): Promise<void> {
  const stripeCustomerId: string | undefined = event.data.object?.customer;
  if (!stripeCustomerId) return;

  const lookup = await lookupByStripeCustomer(stripeCustomerId, usageLogsKV);
  if (!lookup) {
    console.error("invoice.payment_failed: no reverse mapping for", stripeCustomerId);
    return;
  }

  const keyInfoStr = await apiKeysKV.get(lookup.apiKeyHash);
  if (!keyInfoStr) return;
  const keyInfo: ApiKeyInfo = JSON.parse(keyInfoStr);
  keyInfo.status = "suspended";
  await apiKeysKV.put(lookup.apiKeyHash, JSON.stringify(keyInfo));
}

/**
 * invoice.payment_succeeded 処理 — suspended なら "active" に復帰
 */
async function handlePaymentSucceeded(
  event: any,
  apiKeysKV: KVNamespace,
  usageLogsKV: KVNamespace
): Promise<void> {
  const stripeCustomerId: string | undefined = event.data.object?.customer;
  if (!stripeCustomerId) return;

  const lookup = await lookupByStripeCustomer(stripeCustomerId, usageLogsKV);
  if (!lookup) return;

  const keyInfoStr = await apiKeysKV.get(lookup.apiKeyHash);
  if (!keyInfoStr) return;
  const keyInfo: ApiKeyInfo = JSON.parse(keyInfoStr);
  if (keyInfo.status === "suspended") {
    keyInfo.status = "active";
    await apiKeysKV.put(lookup.apiKeyHash, JSON.stringify(keyInfo));
  }
}

/**
 * customer.subscription.deleted 処理
 *
 * - plan → "free" に降格
 * - stripeCustomerId / stripeSubscriptionId を削除
 * - stripe:customer-map から削除
 * - stripe-reverse を削除
 */
async function handleSubscriptionDeleted(
  event: any,
  apiKeysKV: KVNamespace,
  usageLogsKV: KVNamespace
): Promise<void> {
  const stripeCustomerId: string | undefined = event.data.object?.customer;
  if (!stripeCustomerId) return;

  const lookup = await lookupByStripeCustomer(stripeCustomerId, usageLogsKV);
  if (!lookup) {
    console.error("customer.subscription.deleted: no reverse mapping for", stripeCustomerId);
    return;
  }

  // 1. API_KEYS を更新（free 降格、Stripe情報削除）
  const keyInfoStr = await apiKeysKV.get(lookup.apiKeyHash);
  if (keyInfoStr) {
    const keyInfo: ApiKeyInfo = JSON.parse(keyInfoStr);
    keyInfo.plan = "free";
    delete keyInfo.stripeCustomerId;
    delete keyInfo.stripeSubscriptionId;
    keyInfo.status = "active";
    await apiKeysKV.put(lookup.apiKeyHash, JSON.stringify(keyInfo));
  }

  // 2. stripe:customer-map から削除
  const mapStr = await usageLogsKV.get("stripe:customer-map");
  if (mapStr) {
    const map = JSON.parse(mapStr);
    delete map[lookup.customerId];
    await usageLogsKV.put("stripe:customer-map", JSON.stringify(map));
  }

  // 3. stripe-reverse を削除
  await usageLogsKV.delete(`stripe-reverse:${stripeCustomerId}`);
}

// ─── メインハンドラー ─────────────────────────────────────────

webhook.post("/", async (c) => {
  // Webhook Secret 確認
  const webhookSecret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Webhook not configured." } },
      500
    );
  }

  // Stripe-Signature ヘッダー取得
  const signatureHeader = c.req.header("Stripe-Signature");
  if (!signatureHeader) {
    return c.json(
      { error: { code: "INVALID_SIGNATURE", message: "Missing Stripe-Signature header." } },
      401
    );
  }

  // ボディ取得
  const rawBody = await c.req.text();

  // 署名検証
  const isValid = await verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
  if (!isValid) {
    return c.json(
      { error: { code: "INVALID_SIGNATURE", message: "Invalid webhook signature." } },
      401
    );
  }

  // イベント解析
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid JSON body." } },
      400
    );
  }

  const eventType: string = event.type;

  // イベントタイプごとの処理
  switch (eventType) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event, c.env.API_KEYS, c.env.USAGE_LOGS);
      break;
    case "invoice.payment_failed":
      await handlePaymentFailed(event, c.env.API_KEYS, c.env.USAGE_LOGS);
      break;
    case "invoice.payment_succeeded":
      await handlePaymentSucceeded(event, c.env.API_KEYS, c.env.USAGE_LOGS);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event, c.env.API_KEYS, c.env.USAGE_LOGS);
      break;
    default:
      // 未対応イベントは無視して200を返す
      break;
  }

  return c.json({ received: true });
});

export { webhook };
