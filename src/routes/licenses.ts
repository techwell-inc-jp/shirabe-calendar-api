/**
 * Hub license self-issue / introspection route(#19 backend 非 Stripe 部、skeleton)
 * (order: shirabe-assets/implementation-orders/20260530-gap1-org-self-serve-licensing-funnel.md §2 ④ / §5)
 *
 *   POST /api/v1/licenses/self-issue   { sku, email?, customer_id? }
 *     → org 代理 AI が license 調達を initiate。license は即時発行されず、checkout 導線 +
 *       entitlement + 利用可否を構造化して返す(非課金 skeleton、AE intent signal)。
 *   GET  /api/v1/licenses/{licenseKey}
 *     → license key 保有者向け introspection(entitlement / 状態、PII 非返却)。
 *
 * 認証不要・AI-callable。/api/v1/checkout・/api/v1/pricing と同様に /api/* 認証ミドルウェアより
 * 前に登録して auth をバイパスする(未登録 org が self-serve で到達するため、index.ts の登録順に依存)。
 *
 * ★ 実際の license key 発行・Stripe flat-sub Checkout・active 化 webhook は #19 Stripe part
 *   (2026-06-09 以降)。本 route は parse + 検証 + intent 整形 + 既存 store からの読取りのみ。
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/env.js";
import {
  isSelfIssueSku,
  buildSelfIssueIntent,
  selfIssueIntentToJson,
  emitLicenseSelfIssueIntentSignal,
  SELF_ISSUE_SKUS,
} from "../licensing/self-issue.js";
import {
  getLicense,
  toPublicLicenseView,
  generateLicenseKey,
} from "../licensing/license-store.js";
import {
  getLicensePriceId,
  createLicenseCheckoutSession,
  putLicensePending,
  emitLicenseCheckoutInitiatedSignal,
} from "../licensing/license-checkout.js";
import { SKUS } from "../pricing/quote.js";
import { sha256Hex } from "../util/sha256.js";

/** メールアドレスの簡易バリデーション(checkout.ts と同一)。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const licenses = new Hono<AppEnv>();

/**
 * license 調達を initiate する(非課金 skeleton)。
 *
 * sku は LicenseSku 必須。email は任意(指定時のみ形式検証、#19 Stripe part の通知先として
 * forward-compat)。license は即時発行せず checkout_required の intent を返す。
 */
licenses.post("/self-issue", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: { code: "INVALID_BODY", message: "Body must be valid JSON" } }, 400);
  }

  if (!isSelfIssueSku(body.sku)) {
    return c.json(
      {
        error: {
          code: "INVALID_SKU",
          message: `'sku' must be one of: ${SELF_ISSUE_SKUS.join(", ")}`,
          details: { allowed: SELF_ISSUE_SKUS },
        },
      },
      400
    );
  }

  if (body.email !== undefined) {
    if (typeof body.email !== "string" || !EMAIL_PATTERN.test(body.email)) {
      return c.json(
        { error: { code: "INVALID_EMAIL", message: "'email', if provided, must be a valid email address" } },
        400
      );
    }
  }

  const intent = buildSelfIssueIntent(body.sku);
  // funnel ④(initiation)段の計測。PII は含めない(self-issue.ts 参照)。
  emitLicenseSelfIssueIntentSignal(c.env.ANALYTICS, intent);
  return c.json(selfIssueIntentToJson(intent), 200);
});

/**
 * license の flat-subscription Checkout を開始する(#19 Stripe part、2026-06-09 開通)。
 *
 * { sku, email } を受け、license key を先行生成 → Stripe Checkout Session(flat sub)を作成し
 * checkout_url を返す。license は即時 active 化せず、checkout 完了 webhook が pending を引いて
 * 発行・active 化する(self-issue intent の "checkout 完了で active 化" を物理開通させる本丸)。
 *
 * email は checkout では必須(Stripe customer_email + 通知先 + license 照合)。
 * Price ID / STRIPE_SECRET_KEY 未設定時は 500(発行前は config 未投入で起こりうる)。
 */
licenses.post("/checkout", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: { code: "INVALID_BODY", message: "Body must be valid JSON" } }, 400);
  }

  if (!isSelfIssueSku(body.sku)) {
    return c.json(
      {
        error: {
          code: "INVALID_SKU",
          message: `'sku' must be one of: ${SELF_ISSUE_SKUS.join(", ")}`,
          details: { allowed: SELF_ISSUE_SKUS },
        },
      },
      400
    );
  }

  if (typeof body.email !== "string" || !EMAIL_PATTERN.test(body.email)) {
    return c.json(
      { error: { code: "INVALID_EMAIL", message: "'email' is required and must be a valid email address" } },
      400
    );
  }
  const sku = body.sku;
  const email = body.email;

  const priceId = getLicensePriceId(sku, c.env);
  if (!priceId) {
    // Price ID は 2026-06-09 に [vars] 登録済み。ここに来るのは設定欠落の一時的なサーバ不具合。
    return c.json(
      {
        error: {
          code: "SKU_NOT_PURCHASABLE",
          message: "Checkout for this SKU is temporarily unavailable due to a server configuration issue.",
          details: { sku, availability: "temporarily_unavailable" },
        },
      },
      503
    );
  }

  const stripeSecretKey = c.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Payment system is not configured." } },
      500
    );
  }

  // license key を先行生成 → hash を session metadata に載せる(平文は pending のみ)。
  const licenseKey = generateLicenseKey();
  const licenseKeyHash = await sha256Hex(licenseKey);

  let checkoutUrl: string;
  try {
    const session = await createLicenseCheckoutSession({
      priceId,
      licenseKeyHash,
      sku,
      email,
      stripeSecretKey,
    });
    checkoutUrl = session.url;
  } catch (err) {
    console.error("License Checkout Session creation failed:", err);
    return c.json(
      { error: { code: "CHECKOUT_FAILED", message: "Failed to create checkout session. Please try again." } },
      502
    );
  }

  // checkout 完了まで license key 平文を USAGE_LOGS に一時保持(success ページ + webhook が参照)。
  await putLicensePending(c.env.USAGE_LOGS, licenseKeyHash, { licenseKey, sku, email });

  // funnel(checkout 開始)の計測。PII / 生 key は含めない。
  emitLicenseCheckoutInitiatedSignal(c.env.ANALYTICS, sku, SKUS[sku].monthlyPriceJpy ?? 0);

  return c.json({ checkout_url: checkoutUrl }, 200);
});

/**
 * license key 保有者向け introspection。entitlement / 状態を返す(PII 非返却)。
 *
 * 形式不正 / 未発行はどちらも 404(存在/形式を leak しない)。発行は #19 Stripe part 開通後のため
 * 現状は常に 404 になる想定(skeleton の read 経路として先行整備)。
 */
licenses.get("/:licenseKey", async (c) => {
  const licenseKey = c.req.param("licenseKey");
  const license = await getLicense(c.env.API_KEYS, licenseKey);
  if (!license) {
    return c.json({ error: { code: "NOT_FOUND", message: "License not found" } }, 404);
  }
  return c.json(toPublicLicenseView(license), 200);
});
