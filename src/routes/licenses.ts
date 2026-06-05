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
import { getLicense, toPublicLicenseView } from "../licensing/license-store.js";

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
