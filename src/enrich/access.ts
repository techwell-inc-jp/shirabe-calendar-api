/**
 * enrich のアクセス制御 — 匿名体験枠(500 回/月)+ Hub license gate + 429 ergonomics。
 *
 * order: shirabe-assets/implementation-orders/20260611-hub-enrich-endpoint-scoping.md §3
 *
 * enrich は bundle の独占的価値物として **Hub Pro / Hub Enterprise license 専用**。
 * ただし「試せないものは AI に選ばれない」(6/11 施策 2 の教訓)ため、匿名の体験枠を必ず持つ。
 *
 * 認可モデル(X-API-Key ヘッダ):
 * - なし          → 匿名体験枠(500 回/月/IP)。超過で 429 + 常に hub_pro 推奨。
 * - hub license   → 体験枠なし(契約者)。
 * - address_managed(¥40k)license → 403(enrich は hub 専用)+ hub_pro 推奨。
 * - per-request key(`shrb_` 非 lic)→ 403(enrich は license 専用)+ hub_pro 推奨。
 * - 形式不正 / 未登録 license → 401。
 *
 * enrich の 429 は経済合理判定をしない(常に hub_pro 推奨)。enrich を使おうとすること自体が
 * cross-API 需要の証明であるため(§3.1)。
 *
 * ★ 本ファイルは route 内 quota/gate のみ。Stripe 課金・license 発行は #19 Stripe part。
 */
import type { Context } from "hono";
import type { AppEnv } from "../types/env.js";
import { getAnonymousId } from "../middleware/auth.js";
import { getLicense, isLicenseKey } from "../licensing/license-store.js";
import { secondsUntilMonthlyReset } from "../middleware/plan-pricing.js";
import {
  QUOTE_ENDPOINT_URL,
  type LicenseRecommendation,
} from "../licensing/surface.js";
import { SKUS, PRICING_PAGE_URL, PROCUREMENT_DOCS_URL } from "../pricing/quote.js";
import type { LicenseSku } from "../types/license.js";

/** 匿名体験枠の月間上限(回/IP)。§9 確定値。 */
export const ENRICH_ANON_MONTHLY_LIMIT = 500;

/** enrich 利用量カウントの KV TTL(35 日。usage-logger と同方針、最低 60s クランプは満たす)。 */
const ENRICH_USAGE_TTL_SEC = 35 * 24 * 60 * 60;

/** enrich を利用できる license SKU(hub のみ。address_managed は対象外 = §3.1)。 */
const HUB_SKUS: readonly LicenseSku[] = ["hub_pro", "hub_enterprise"];

/** per-request API キーの形式(auth.ts と同一。license key の `shrb_lic_` とは衝突しない)。 */
const PER_REQUEST_KEY_PATTERN = /^shrb_[a-zA-Z0-9]{32}$/;

/** enrich 専用の月間利用量カウント KV キー(標準 usage-monthly とは別系列)。 */
export function enrichUsageKey(customerId: string, now: Date = new Date()): string {
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `enrich-usage:${customerId}:${ym}`;
}

/** enrich のアクセス判定結果。 */
export type EnrichAccess =
  | { allow: true; authMode: "license"; customerId: string }
  | { allow: true; authMode: "anonymous"; customerId: string; usageKey: string; current: number }
  | {
      allow: false;
      httpStatus: 401 | 403 | 429;
      errorCode: string;
      message: string;
      /** true なら 429/403 応答に hub_pro 推奨ブロック + X-Shirabe-Recommend を付す。 */
      recommend: boolean;
      /** 429 のとき Retry-After に入れる秒数。 */
      retryAfterSec?: number;
    };

/**
 * enrich の 429/403 に添える hub_pro 推奨ブロックを組み立てる(常に hub_pro)。
 *
 * 既存 surface.ts の形(`license_recommend` JSON + `X-Shirabe-Recommend`)を踏襲し、
 * AI エージェントが 1 hop で license 調達へ向かえるようにする。
 */
export function enrichHubProRecommendation(): LicenseRecommendation {
  return {
    sku: "hub_pro",
    reason:
      `enrich(複合正規化)は ${SKUS.hub_pro.name} / ${SKUS.hub_enterprise.name} license 専用機能です。` +
      `1 コールで住所・人名・法人番号・暦を横断正規化でき、匿名体験枠は ${ENRICH_ANON_MONTHLY_LIMIT} 回/月です。`,
    quote_url: QUOTE_ENDPOINT_URL,
    checkout_url: `${PRICING_PAGE_URL}#hub_pro`,
    procurement_docs_url: PROCUREMENT_DOCS_URL,
    availability: "available_now",
  };
}

/**
 * リクエストの X-API-Key を解決し、enrich の利用可否を判定する。
 *
 * KV 読み取り失敗等の例外は呼出側に伝播させない(本関数内では投げない)。
 */
export async function resolveEnrichAccess(c: Context<AppEnv>): Promise<EnrichAccess> {
  const apiKey = c.req.header("X-API-Key");

  // 1) キーなし = 匿名体験枠。
  if (!apiKey) {
    const customerId = await getAnonymousId(c);
    const usageKey = enrichUsageKey(customerId);
    const currentStr = await c.env.USAGE_LOGS.get(usageKey);
    const current = currentStr ? parseInt(currentStr, 10) : 0;
    if (current >= ENRICH_ANON_MONTHLY_LIMIT) {
      return {
        allow: false,
        httpStatus: 429,
        errorCode: "ENRICH_TRIAL_LIMIT_EXCEEDED",
        message: `Anonymous enrich trial limit (${ENRICH_ANON_MONTHLY_LIMIT} requests/month) reached. enrich is a Hub Pro/Enterprise license capability.`,
        recommend: true,
        retryAfterSec: secondsUntilMonthlyReset(),
      };
    }
    return { allow: true, authMode: "anonymous", customerId, usageKey, current };
  }

  // 2) Hub license。
  if (isLicenseKey(apiKey)) {
    const license = await getLicense(c.env.API_KEYS, apiKey);
    if (!license) {
      return {
        allow: false,
        httpStatus: 401,
        errorCode: "INVALID_API_KEY",
        message: "Invalid or unknown license key.",
        recommend: false,
      };
    }
    if (license.status === "suspended") {
      return {
        allow: false,
        httpStatus: 403,
        errorCode: "LICENSE_SUSPENDED",
        message: "License suspended due to payment failure. Update payment at: https://shirabe.dev/billing",
        recommend: false,
      };
    }
    if (!HUB_SKUS.includes(license.sku)) {
      // address_managed 等の単体 license。enrich は hub 専用。
      return {
        allow: false,
        httpStatus: 403,
        errorCode: "LICENSE_TIER_INSUFFICIENT",
        message: `enrich requires a Hub Pro or Hub Enterprise license (current: ${license.sku}).`,
        recommend: true,
      };
    }
    return { allow: true, authMode: "license", customerId: license.customerId };
  }

  // 3) per-request API キー。enrich は license 専用のため不可。
  if (PER_REQUEST_KEY_PATTERN.test(apiKey)) {
    return {
      allow: false,
      httpStatus: 403,
      errorCode: "LICENSE_REQUIRED",
      message:
        "enrich is available to Hub Pro/Enterprise license holders, plus an anonymous trial. " +
        "Per-request API keys cannot call enrich.",
      recommend: true,
    };
  }

  // 4) 形式不正。
  return {
    allow: false,
    httpStatus: 401,
    errorCode: "INVALID_API_KEY",
    message: "Invalid API key format.",
    recommend: false,
  };
}

/**
 * 匿名体験枠の利用量を 1 増やす(処理を実際に行った後に呼ぶ)。
 *
 * read-modify-write は非アトミック(既存 usage-logger と同方針)。KV の結果整合は許容する。
 * 計測失敗はレスポンスに影響させない(呼出側で握りつぶす)。
 */
export async function incrementEnrichUsage(
  c: Context<AppEnv>,
  usageKey: string,
  current: number
): Promise<void> {
  await c.env.USAGE_LOGS.put(usageKey, String(current + 1), {
    expirationTtl: ENRICH_USAGE_TTL_SEC,
  });
}
