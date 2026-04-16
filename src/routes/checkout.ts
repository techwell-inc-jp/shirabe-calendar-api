/**
 * Stripe Checkout + APIキー自動発行（Phase 3）
 *
 * POST /api/v1/checkout
 *   - リクエスト: { email: string, plan: "starter" | "pro" | "enterprise" }
 *   - 処理: バリデーション → APIキー生成 → SHA-256ハッシュ → Stripe Checkout Session 作成 → KV一時保存 → URL返却
 *   - レスポンス: { checkout_url: string }
 *
 * Stripe SDK は使わず fetch で REST API を直接呼ぶ（Cloudflare Workers 互換性のため）
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/env.js";

const checkout = new Hono<AppEnv>();

/** 有料プラン名（Free は対象外） */
const VALID_PLANS = ["starter", "pro", "enterprise"] as const;
type PaidPlan = (typeof VALID_PLANS)[number];

/** メールアドレスの簡易バリデーション */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** APIキーに使うランダム英数字の文字セット */
const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** checkout-pending の TTL（1時間 = 3600秒） */
const PENDING_TTL = 3600;

/**
 * SHA-256ハッシュを16進文字列で返す
 */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * shrb_ + 32文字ランダム英数字 のAPIキーを生成する
 */
function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let key = "shrb_";
  for (let i = 0; i < 32; i++) {
    key += CHARSET[bytes[i] % CHARSET.length];
  }
  return key;
}

/**
 * プラン名に対応する Stripe Price ID を環境変数から取得する
 */
function getPriceId(plan: PaidPlan, env: AppEnv["Bindings"]): string | undefined {
  const map: Record<PaidPlan, string | undefined> = {
    starter: env.STRIPE_PRICE_STARTER,
    pro: env.STRIPE_PRICE_PRO,
    enterprise: env.STRIPE_PRICE_ENTERPRISE,
  };
  return map[plan];
}

/**
 * Stripe Checkout Session を作成する（fetch で Stripe REST API を直接呼ぶ）
 */
async function createStripeCheckoutSession(params: {
  priceId: string;
  apiKeyHash: string;
  plan: string;
  email: string;
  stripeSecretKey: string;
}): Promise<{ url: string }> {
  const body = new URLSearchParams();
  body.append("mode", "subscription");
  body.append("line_items[0][price]", params.priceId);
  // metered 価格 (usage_type=metered) では quantity を指定不可。
  // 数量は Billing Meter Events から自動算出されるため line_items に含めない。
  body.append("customer_email", params.email);
  body.append("metadata[apiKeyHash]", params.apiKeyHash);
  body.append("metadata[plan]", params.plan);
  body.append(
    "success_url",
    "https://shirabe.dev/checkout/success?session_id={CHECKOUT_SESSION_ID}"
  );
  body.append("cancel_url", "https://shirabe.dev/checkout/cancel");

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(params.stripeSecretKey + ":")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stripe API error (${res.status}): ${err}`);
  }

  const session = (await res.json()) as { url: string };
  return { url: session.url };
}

/**
 * POST /api/v1/checkout
 */
checkout.post("/", async (c) => {
  // ---- リクエストボディ解析 ----
  let body: { email?: string; plan?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Request body must be valid JSON with email and plan.",
        },
      },
      400
    );
  }

  const { email, plan } = body;

  // ---- バリデーション ----
  if (!email || !EMAIL_PATTERN.test(email)) {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "A valid email address is required.",
        },
      },
      400
    );
  }

  if (!plan || !VALID_PLANS.includes(plan as PaidPlan)) {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: `plan must be one of: ${VALID_PLANS.join(", ")}`,
        },
      },
      400
    );
  }

  const paidPlan = plan as PaidPlan;

  // ---- Price ID 取得 ----
  const priceId = getPriceId(paidPlan, c.env);
  if (!priceId) {
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Stripe Price ID is not configured for this plan.",
        },
      },
      500
    );
  }

  // ---- STRIPE_SECRET_KEY 確認 ----
  const stripeSecretKey = c.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Payment system is not configured.",
        },
      },
      500
    );
  }

  // ---- APIキー生成 + ハッシュ化 ----
  const apiKey = generateApiKey();
  const apiKeyHash = await sha256Hex(apiKey);

  // ---- Stripe Checkout Session 作成 ----
  let checkoutUrl: string;
  try {
    const session = await createStripeCheckoutSession({
      priceId,
      apiKeyHash,
      plan: paidPlan,
      email,
      stripeSecretKey,
    });
    checkoutUrl = session.url;
  } catch (err) {
    console.error("Stripe Checkout Session creation failed:", err);
    return c.json(
      {
        error: {
          code: "CHECKOUT_FAILED",
          message: "Failed to create checkout session. Please try again.",
        },
      },
      502
    );
  }

  // ---- KV に一時保存（TTL: 1時間） ----
  const pendingKey = `checkout-pending:${apiKeyHash}`;
  const pendingData = JSON.stringify({
    apiKey,
    plan: paidPlan,
    email,
  });
  await c.env.USAGE_LOGS.put(pendingKey, pendingData, {
    expirationTtl: PENDING_TTL,
  });

  // ---- レスポンス ----
  return c.json({ checkout_url: checkoutUrl });
});

export { checkout, generateApiKey, sha256Hex };
