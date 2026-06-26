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
 * - customer.subscription.updated → plan 変更追従(per-request plan / Hub License SKU)
 * - customer.subscription.deleted → plan を "free" に降格、Stripe情報削除
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/env.js";
import type { ApiKeyInfo } from "../middleware/auth.js";
import {
  isAggregatedApiKeyInfo,
  type AggregatedApiKeyInfo,
  type ApiPlanInfo,
  type StoredApiKeyInfo,
} from "../types/api-key.js";
import { sha256Hex } from "../util/sha256.js";
import { buildLicense, getLicense, putLicense } from "../licensing/license-store.js";
import { getLicensePending, licenseStripeReverseKvKey } from "../licensing/license-checkout.js";
import { SKU_ENTITLED_APIS } from "../types/license.js";
import type { LicenseStatus, LicenseSku } from "../types/license.js";

/**
 * G-A Phase 1: cross-API correlation KV write
 *
 * KV key: `correlation:{email_sha256}` を USAGE_LOGS namespace に書込。
 * value: { api, stripe_customer_id, plan, status, subscribed_at, updated_at }
 *
 * batch script(shirabe-assets/scripts/cross-api-aggregate.ts)が weekly cron で
 * 各 API repo の /internal/correlation を fetch + 集計 → api_concurrency_rate /
 * set_contract_arpu 算出 → hypotheses/business/api-concurrency.yaml 更新。
 *
 * email の lowercase 化は同一 customer が大文字小文字違いで複数 entry を作らないため。
 *
 * Phase 1 範囲: checkout.session.completed のみ。payment_failed / subscription_deleted
 * 等の status drift は Phase 2(6 月モノレポ化 D1)で解消。drift 期間中も「どの email が
 * どの API を契約しているか」の集合情報は維持(plan の最新性は失われるが api_concurrency_rate
 * への影響なし)。
 */
async function writeCorrelationEntry(
  usageLogsKV: KVNamespace,
  email: string,
  stripeCustomerId: string | undefined,
  plan: string,
  status: "active" | "suspended" | "canceled"
): Promise<void> {
  const emailNormalized = email.trim().toLowerCase();
  if (!emailNormalized) return;
  const emailHash = await sha256Hex(emailNormalized);
  const now = new Date().toISOString();
  const entry = {
    api: "calendar",
    stripe_customer_id: stripeCustomerId,
    plan,
    status,
    subscribed_at: now,
    updated_at: now,
  };
  await usageLogsKV.put(`correlation:${emailHash}`, JSON.stringify(entry));
}

const webhook = new Hono<AppEnv>();

/**
 * 既存の KV 値が新フォーマット(AggregatedApiKeyInfo)なら返す。
 * 旧フォーマット・パース失敗・未登録は null を返す。
 *
 * Issue #27 防御的 patch: 暦 webhook が新フォーマットを破壊しないため、
 * 各ハンドラ冒頭でフォーマットを判定し、新フォーマット時は apis.calendar
 * のみネスト更新する。住所 API などの他 API の状態は保持する。
 */
function readExistingAggregated(stored: string | null): AggregatedApiKeyInfo | null {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as StoredApiKeyInfo;
    return isAggregatedApiKeyInfo(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 集約フォーマットの apis.calendar を更新するヘルパ。
 * 他 API(apis.address 等)の情報は保持される。
 */
function withCalendarPlan(
  aggregated: AggregatedApiKeyInfo,
  planInfo: ApiPlanInfo
): AggregatedApiKeyInfo {
  return {
    ...aggregated,
    apis: {
      ...aggregated.apis,
      calendar: planInfo,
    },
  };
}

/**
 * 集約フォーマット内で「暦以外に有償プランの API があるか」を判定する。
 * stripeCustomerId / stripe-reverse の保守的削除判断に使う。
 */
function hasOtherPaidApi(aggregated: AggregatedApiKeyInfo): boolean {
  for (const [apiName, planInfo] of Object.entries(aggregated.apis)) {
    if (apiName === "calendar") continue;
    if (planInfo && planInfo.plan !== "free") return true;
  }
  return false;
}

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
 * Hub license の checkout.session.completed 処理(#19 Stripe part)
 *
 * metadata.kind="license" の session を処理する。先行生成済みの license key 平文を
 * license-pending(USAGE_LOGS)から引き、active な license レコードを発行(API_KEYS の
 * `license:{key}`)、Stripe customer → license key 逆引き(USAGE_LOGS)を登録する。
 *
 * ※ license-pending は削除しない(/licenses/checkout/success が key 表示に使う、TTL 失効)。
 */
async function handleLicenseCheckoutCompleted(
  event: any,
  apiKeysKV: KVNamespace,
  usageLogsKV: KVNamespace
): Promise<void> {
  const session = event.data.object;
  const licenseKeyHash: string | undefined = session.metadata?.licenseKeyHash;
  const stripeCustomerId: string | undefined = session.customer;
  const stripeSubscriptionId: string | undefined = session.subscription;

  if (!licenseKeyHash) {
    console.error("license checkout.session.completed: missing metadata.licenseKeyHash");
    return;
  }

  const pending = await getLicensePending(usageLogsKV, licenseKeyHash);
  if (!pending) {
    console.error("license checkout.session.completed: license-pending not found for hash:", licenseKeyHash);
    return;
  }

  const customerId = `lic_${licenseKeyHash.slice(0, 16)}`;
  const license = buildLicense({
    licenseKey: pending.licenseKey,
    customerId,
    sku: pending.sku,
    email: pending.email,
    stripeCustomerId,
    stripeSubscriptionId,
  });
  await putLicense(apiKeysKV, license);

  // Stripe customer → license key 逆引き(payment_failed/succeeded/subscription.deleted 用)。
  if (stripeCustomerId) {
    await usageLogsKV.put(licenseStripeReverseKvKey(stripeCustomerId), pending.licenseKey);
  }
  // email → license key 索引(self-serve キー再発行が email から license を引くのに使う)。
  // per-request の `email:{email}` 索引と対になる Hub License 用索引。
  if (pending.email) {
    await usageLogsKV.put(`license-email:${pending.email}`, pending.licenseKey);
  }
  // license-pending は削除しない(success ページとの競合回避、TTL 失効)。
}

/**
 * Stripe customer に紐づく license の status を遷移させる。
 *
 * license-stripe-reverse(USAGE_LOGS)で license key を逆引きし、存在すれば status を更新する。
 *
 * @returns その customer が license 顧客だった(= 本ハンドラが処理を引き受けた)なら true。
 *   false の場合は per-request key 顧客なので呼出側は従来処理にフォールスルーする。
 */
async function applyLicenseStatusByStripeCustomer(
  stripeCustomerId: string,
  apiKeysKV: KVNamespace,
  usageLogsKV: KVNamespace,
  nextStatus: LicenseStatus,
  opts?: { onlyIfSuspended?: boolean }
): Promise<boolean> {
  const licenseKey = await usageLogsKV.get(licenseStripeReverseKvKey(stripeCustomerId));
  if (!licenseKey) return false; // license 顧客ではない → 従来処理へ
  const license = await getLicense(apiKeysKV, licenseKey);
  if (!license) return true; // 逆引きはあるがレコード喪失。license 顧客として処理済み扱い。
  if (opts?.onlyIfSuspended && license.status !== "suspended") return true;
  if (license.status === nextStatus) return true;
  await putLicense(apiKeysKV, { ...license, status: nextStatus });
  return true;
}

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
 *
 * ※ metadata.kind="license"(Hub license flat-sub)は handleLicenseCheckoutCompleted に委譲。
 */
async function handleCheckoutCompleted(
  event: any,
  apiKeysKV: KVNamespace,
  usageLogsKV: KVNamespace
): Promise<void> {
  const session = event.data.object;
  if (session.metadata?.kind === "license") {
    await handleLicenseCheckoutCompleted(event, apiKeysKV, usageLogsKV);
    return;
  }
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
  const now = new Date().toISOString();

  // 1. KV API_KEYS に登録
  //    既存値が新フォーマット(住所 API webhook が書き込み済み等)なら apis.calendar を merge、
  //    それ以外(未登録 / 旧フォーマット)は従来通り旧フォーマットで全置換する。
  //    Issue #27 防御的 patch: 住所 API などの apis.* を破壊しない。
  const existingAggregated = readExistingAggregated(await apiKeysKV.get(apiKeyHash));
  if (existingAggregated) {
    const calendarPlanInfo: ApiPlanInfo = {
      plan: plan as ApiPlanInfo["plan"],
      status: "active",
      stripeSubscriptionId,
      updatedAt: now,
    };
    const merged: AggregatedApiKeyInfo = {
      ...existingAggregated,
      stripeCustomerId: stripeCustomerId ?? existingAggregated.stripeCustomerId,
      email: pending.email ?? existingAggregated.email,
      apis: {
        ...existingAggregated.apis,
        calendar: calendarPlanInfo,
      },
    };
    await apiKeysKV.put(apiKeyHash, JSON.stringify(merged));
  } else {
    const keyInfo: ApiKeyInfo = {
      plan: plan as ApiKeyInfo["plan"],
      customerId,
      stripeCustomerId,
      stripeSubscriptionId,
      email: pending.email,
      status: "active",
      createdAt: now,
    };
    await apiKeysKV.put(apiKeyHash, JSON.stringify(keyInfo));
  }

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

  // 5. G-A Phase 1: cross-API correlation KV write(weekly batch script で集計用)
  if (pending.email) {
    await writeCorrelationEntry(usageLogsKV, pending.email, stripeCustomerId, plan, "active");
  }

  // 6. checkout-pending は削除しない（/checkout/success ページとの競合回避）
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

  // Hub license 顧客なら license を suspended に(per-request 顧客でないため早期 return)。
  if (await applyLicenseStatusByStripeCustomer(stripeCustomerId, apiKeysKV, usageLogsKV, "suspended")) return;

  const lookup = await lookupByStripeCustomer(stripeCustomerId, usageLogsKV);
  if (!lookup) {
    console.error("invoice.payment_failed: no reverse mapping for", stripeCustomerId);
    return;
  }

  const keyInfoStr = await apiKeysKV.get(lookup.apiKeyHash);
  if (!keyInfoStr) return;

  // Issue #27 防御的 patch: 新フォーマットなら apis.calendar.status をネスト更新
  const existingAggregated = readExistingAggregated(keyInfoStr);
  if (existingAggregated) {
    if (!existingAggregated.apis.calendar) return; // 暦未契約なら何もしない
    const updated = withCalendarPlan(existingAggregated, {
      ...existingAggregated.apis.calendar,
      status: "suspended",
      updatedAt: new Date().toISOString(),
    });
    await apiKeysKV.put(lookup.apiKeyHash, JSON.stringify(updated));
    return;
  }

  // 旧フォーマット: 既存挙動
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

  // Hub license 顧客なら suspended → active に復帰(per-request 顧客でないため早期 return)。
  if (
    await applyLicenseStatusByStripeCustomer(stripeCustomerId, apiKeysKV, usageLogsKV, "active", {
      onlyIfSuspended: true,
    })
  )
    return;

  const lookup = await lookupByStripeCustomer(stripeCustomerId, usageLogsKV);
  if (!lookup) return;

  const keyInfoStr = await apiKeysKV.get(lookup.apiKeyHash);
  if (!keyInfoStr) return;

  // Issue #27 防御的 patch: 新フォーマットなら apis.calendar.status をネスト更新
  const existingAggregated = readExistingAggregated(keyInfoStr);
  if (existingAggregated) {
    if (!existingAggregated.apis.calendar) return;
    if (existingAggregated.apis.calendar.status !== "suspended") return;
    const updated = withCalendarPlan(existingAggregated, {
      ...existingAggregated.apis.calendar,
      status: "active",
      updatedAt: new Date().toISOString(),
    });
    await apiKeysKV.put(lookup.apiKeyHash, JSON.stringify(updated));
    return;
  }

  // 旧フォーマット: 既存挙動
  const keyInfo: ApiKeyInfo = JSON.parse(keyInfoStr);
  if (keyInfo.status === "suspended") {
    keyInfo.status = "active";
    await apiKeysKV.put(lookup.apiKeyHash, JSON.stringify(keyInfo));
  }
}

/**
 * Stripe customer に紐づく Hub License の SKU(= プラン階層)を price.id から追従させる。
 *
 * customer.subscription.updated で Hub License の tier 変更(hub_pro ↔ hub_enterprise ↔
 * address_managed)が起きた場合に、license の sku と entitledApis を再導出して保存する。
 * status は変更しない(active/suspended は payment_* / deleted が駆動)。
 *
 * @returns その customer が license 顧客だった(本ハンドラが処理を引き受けた)なら true。
 *   false の場合は per-request key 顧客なので呼出側は従来処理にフォールスルーする。
 */
async function applyLicenseSkuByStripeCustomer(
  stripeCustomerId: string,
  priceId: string | undefined,
  stripeSubscriptionId: string | undefined,
  apiKeysKV: KVNamespace,
  usageLogsKV: KVNamespace,
  env: AppEnv["Bindings"]
): Promise<boolean> {
  const licenseKey = await usageLogsKV.get(licenseStripeReverseKvKey(stripeCustomerId));
  if (!licenseKey) return false; // license 顧客ではない → 従来処理へ
  const license = await getLicense(apiKeysKV, licenseKey);
  if (!license) return true; // 逆引きはあるがレコード喪失。license 顧客として処理済み扱い。

  // price.id → LicenseSku 逆引き(getLicensePriceId の逆写像)。
  let sku: LicenseSku | null = null;
  if (priceId && priceId === env.STRIPE_PRICE_ADDRESS_MANAGED) sku = "address_managed";
  else if (priceId && priceId === env.STRIPE_PRICE_HUB_PRO) sku = "hub_pro";
  else if (priceId && priceId === env.STRIPE_PRICE_HUB_ENTERPRISE) sku = "hub_enterprise";
  // 未知の price / SKU 変更なし → license 顧客として処理済み(no-op)。
  if (!sku || sku === license.sku) return true;

  await putLicense(apiKeysKV, {
    ...license,
    sku,
    entitledApis: [...SKU_ENTITLED_APIS[sku]],
    stripeSubscriptionId: stripeSubscriptionId ?? license.stripeSubscriptionId,
    updatedAt: new Date().toISOString(),
  });
  return true;
}

/**
 * customer.subscription.updated 処理 — プラン変更を追従する。
 *
 * - Hub License 顧客: SKU(tier)変更を sku / entitledApis に反映(applyLicenseSkuByStripeCustomer)。
 * - per-request 顧客: price.id → plan(starter/pro/enterprise)を apis.calendar.plan に反映
 *   (住所 / text / 法人 API の handleSubscriptionUpdated と同型)。
 *
 * 対象 customer が見つからない / price 未知 / 変更なしの場合は no-op。
 */
async function handleSubscriptionUpdated(
  event: any,
  apiKeysKV: KVNamespace,
  usageLogsKV: KVNamespace,
  env: AppEnv["Bindings"]
): Promise<void> {
  const subscription = event.data.object;
  const stripeCustomerId: string | undefined = subscription?.customer;
  const stripeSubscriptionId: string | undefined = subscription?.id;
  if (!stripeCustomerId) return;
  const priceId: string | undefined = subscription?.items?.data?.[0]?.price?.id;

  // Hub License 顧客なら SKU 変更を追従(per-request 顧客でないため早期 return)。
  if (
    await applyLicenseSkuByStripeCustomer(
      stripeCustomerId,
      priceId,
      stripeSubscriptionId,
      apiKeysKV,
      usageLogsKV,
      env
    )
  )
    return;

  // per-request key 顧客: plan 変更を apis.calendar.plan に反映。
  const lookup = await lookupByStripeCustomer(stripeCustomerId, usageLogsKV);
  if (!lookup) return;
  const keyInfoStr = await apiKeysKV.get(lookup.apiKeyHash);
  if (!keyInfoStr) return;

  let plan: ApiPlanInfo["plan"] | null = null;
  if (priceId === env.STRIPE_PRICE_STARTER) plan = "starter";
  else if (priceId === env.STRIPE_PRICE_PRO) plan = "pro";
  else if (priceId === env.STRIPE_PRICE_ENTERPRISE) plan = "enterprise";
  if (!plan) return;

  // Issue #27 防御的 patch: 新フォーマットなら apis.calendar.plan をネスト更新。
  const existingAggregated = readExistingAggregated(keyInfoStr);
  if (existingAggregated) {
    if (!existingAggregated.apis.calendar) return;
    if (existingAggregated.apis.calendar.plan === plan) return;
    const updated = withCalendarPlan(existingAggregated, {
      ...existingAggregated.apis.calendar,
      plan,
      stripeSubscriptionId,
      updatedAt: new Date().toISOString(),
    });
    await apiKeysKV.put(lookup.apiKeyHash, JSON.stringify(updated));
    return;
  }

  // 旧フォーマット: 既存挙動
  const keyInfo: ApiKeyInfo = JSON.parse(keyInfoStr);
  if (keyInfo.plan !== plan) {
    keyInfo.plan = plan as ApiKeyInfo["plan"];
    keyInfo.stripeSubscriptionId = stripeSubscriptionId;
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

  // Hub license 顧客なら license を suspended に(解約 = entitlement 失効、per-request 顧客でないため早期 return)。
  if (await applyLicenseStatusByStripeCustomer(stripeCustomerId, apiKeysKV, usageLogsKV, "suspended")) return;

  const lookup = await lookupByStripeCustomer(stripeCustomerId, usageLogsKV);
  if (!lookup) {
    console.error("customer.subscription.deleted: no reverse mapping for", stripeCustomerId);
    return;
  }

  // 1. API_KEYS を更新（free 降格、Stripe情報削除）
  //    Issue #27 防御的 patch: 新フォーマットなら apis.calendar のみ free 化、
  //    他 API(住所など)が有償プランの場合は stripeCustomerId / stripe-reverse / customer-map を保守的に保持。
  const keyInfoStr = await apiKeysKV.get(lookup.apiKeyHash);
  let preserveStripeBindings = false;
  if (keyInfoStr) {
    const existingAggregated = readExistingAggregated(keyInfoStr);
    if (existingAggregated) {
      const updated = withCalendarPlan(existingAggregated, {
        plan: "free",
        status: "active",
        updatedAt: new Date().toISOString(),
      });
      // 暦以外の有償プラン API がある場合は stripeCustomerId を保持
      if (hasOtherPaidApi(updated)) {
        preserveStripeBindings = true;
      } else {
        delete updated.stripeCustomerId;
      }
      await apiKeysKV.put(lookup.apiKeyHash, JSON.stringify(updated));
    } else {
      // 旧フォーマット: 既存挙動
      const keyInfo: ApiKeyInfo = JSON.parse(keyInfoStr);
      keyInfo.plan = "free";
      delete keyInfo.stripeCustomerId;
      delete keyInfo.stripeSubscriptionId;
      keyInfo.status = "active";
      await apiKeysKV.put(lookup.apiKeyHash, JSON.stringify(keyInfo));
    }
  }

  // 2. stripe:customer-map から削除(他 API が同じ Stripe customer を使用中なら保持)
  if (!preserveStripeBindings) {
    const mapStr = await usageLogsKV.get("stripe:customer-map");
    if (mapStr) {
      const map = JSON.parse(mapStr);
      delete map[lookup.customerId];
      await usageLogsKV.put("stripe:customer-map", JSON.stringify(map));
    }
  }

  // 3. stripe-reverse を削除(他 API が同じ Stripe customer を使用中なら保持)
  if (!preserveStripeBindings) {
    await usageLogsKV.delete(`stripe-reverse:${stripeCustomerId}`);
  }
}

// ─── メインハンドラー ─────────────────────────────────────────

/**
 * Issue #28: dedupe キー TTL(秒)。
 * Stripe webhook の最大 retry window は 3 日(指数バックオフ)。
 * 余裕を持たせて 7 日保持し、再送 event を確実に重複検出する。
 */
const DEDUPE_TTL_SEC = 7 * 24 * 60 * 60;

/** Issue #28: dedupe キー prefix(USAGE_LOGS namespace 内)。 */
const DEDUPE_KEY_PREFIX = "webhook-dedupe:";

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
  const eventId: string | undefined = typeof event.id === "string" ? event.id : undefined;

  // Issue #28 Step 1: Idempotency check (event.id ベース重複検出)
  // Stripe は 2xx 返却後でも同じ event を再送する可能性があり(retry / 重複配信)、
  // 重複処理されると以下の risk が発生する:
  //   (a) email キー上書き衝突(別顧客が同 email を後で登録した場合)
  //   (b) payment_failed → payment_succeeded → retry payment_failed の順序逆転
  //   (c) stripe:customer-map の race による更新喪失
  // event.id 不在(独自テスト等)の場合は dedupe をスキップして従来通り処理する。
  if (eventId) {
    const dedupeKey = `${DEDUPE_KEY_PREFIX}${eventId}`;
    const existing = await c.env.USAGE_LOGS.get(dedupeKey);
    if (existing) {
      return c.json({ received: true, deduped: true });
    }
  }

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
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event, c.env.API_KEYS, c.env.USAGE_LOGS, c.env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event, c.env.API_KEYS, c.env.USAGE_LOGS);
      break;
    default:
      // 未対応イベントは無視して200を返す
      break;
  }

  // Issue #28 Step 2: Mark as processed (handler 成功後、return 直前)
  // ハンドラ内で例外が throw された場合は本行に到達せず dedupe キーが書かれない →
  // Stripe の retry で再処理される(意図通り、処理失敗時は冪等性より retry を優先)。
  // 未対応イベントも mark しておくことで Stripe retry を抑制する。
  if (eventId) {
    const dedupeKey = `${DEDUPE_KEY_PREFIX}${eventId}`;
    await c.env.USAGE_LOGS.put(dedupeKey, new Date().toISOString(), {
      expirationTtl: DEDUPE_TTL_SEC,
    });
  }

  return c.json({ received: true });
});

export { webhook };
