/**
 * License surface 判定ロジック + AE signal(#19 backend 非 Stripe 部、設計A)
 *
 * order: shirabe-assets/implementation-orders/20260530-gap1-org-self-serve-licensing-funnel.md §3 / §6
 *
 * usage signal(cross-API の有償利用数 / 月間 volume)から、経済合理が立つ利用者にのみ
 * license を提示する。判定は純粋関数 `recommendQuote`(pricing/quote.ts)を再利用し、
 * per_request(license 不要)と判定された少量利用者には surface しない
 * (§3.1「過剰提示しない」+ memory `feedback_recommendation_discipline`)。
 *
 * surface 機構(§3.3): 既存の 429 応答に additive な `license_recommend` ブロックを注入し、
 * AI エージェントが parse 可能な `X-Shirabe-Recommend` ヘッダを付す。人間向け画面遷移は
 * 作らない(ルール 1)。
 *
 * ★ 本ファイルは「提示(surface)」のみ。実際の license 発行・課金 Checkout は #19 Stripe part。
 */

import type { AnalyticsEngineDataset } from "../types/env.js";
import {
  recommendQuote,
  PRICING_PAGE_URL,
  PROCUREMENT_DOCS_URL,
  type ApiName,
  type SkuId,
} from "../pricing/quote.js";
import {
  isAggregatedApiKeyInfo,
  migrateToAggregated,
  type StoredApiKeyInfo,
} from "../types/api-key.js";

/** ApiName として認識する集合(quote の ApiName と一致)。 */
const KNOWN_APIS: readonly ApiName[] = ["address", "text", "calendar", "corporation"];

/**
 * KV に保存された API キー情報から「有償利用中(非 Free・active)」の API 群を導出する。
 *
 * cross-API signal(§3.1 の主トリガ)の母集団。新旧フォーマット両対応(api-key.ts)。
 *
 * @param stored KV から読んだ API キー情報
 * @returns 有償利用中の API 名(重複なし)
 */
export function paidApisFromStoredKey(stored: StoredApiKeyInfo): ApiName[] {
  const agg = isAggregatedApiKeyInfo(stored) ? stored : migrateToAggregated(stored);
  const result: ApiName[] = [];
  for (const api of KNOWN_APIS) {
    const info = agg.apis[api];
    if (info && info.plan !== "free" && (info.status ?? "active") === "active") {
      result.push(api);
    }
  }
  return result;
}

/** quote endpoint(AI が完全な見積を 1 hop で取得できる、routes/pricing.ts)。 */
export const QUOTE_ENDPOINT_URL = "https://shirabe.dev/api/v1/pricing/quote";

/** AE 上で license surface イベントを識別する index marker。 */
export const LICENSE_SURFACE_INDEX = "license_surface";

/**
 * surface 判定の入力 signal。
 * - apiContext: 現在 429 を返した API(この repo では "calendar")
 * - paidApis: 当該顧客が有償利用中の API 群(cross-API 判定の母集団。apiContext を含む)
 * - monthlyVolume: 当該 API の月間利用量(break-even 比較に使う)
 */
export interface LicenseSurfaceSignals {
  apiContext: ApiName;
  paidApis: readonly ApiName[];
  monthlyVolume: number;
}

/**
 * 429 応答に additive 注入する license 提示ブロック(§3.3、AI 可読 JSON)。
 */
export interface LicenseRecommendation {
  /** 提示する SKU。per_request は surface しないため含まれない。 */
  sku: Exclude<SkuId, "per_request">;
  /** 提示理由(break-even 根拠を含む透明な説明)。 */
  reason: string;
  /** 完全な見積を取得する endpoint。 */
  quote_url: string;
  /** 透明価格ページ上の当該 SKU の調達入口。 */
  checkout_url: string;
  /** 法務・調達文書(稟議用)。 */
  procurement_docs_url: string;
  /**
   * self-serve 調達の利用可否。flat license は 2026-06-09 に #19 Stripe part が本番開通したため
   * "available_now"(POST /api/v1/licenses/checkout で Stripe Checkout URL を取得)。
   */
  availability: "available_now";
}

/**
 * usage signal から license を提示すべきか判定する(純粋関数)。
 *
 * `recommendQuote` を再利用し、per_request(license 不要)なら null を返して過剰提示を避ける。
 * paidApis は重複排除のうえ apiContext を必ず母集団に含める。
 *
 * @param signals usage signal
 * @returns 提示ブロック、または提示しない場合 null
 */
export function decideLicenseSurface(
  signals: LicenseSurfaceSignals
): LicenseRecommendation | null {
  const apiSet = new Set<ApiName>(signals.paidApis);
  apiSet.add(signals.apiContext);
  const apis = Array.from(apiSet);

  const volume = Number.isFinite(signals.monthlyVolume)
    ? Math.max(0, Math.floor(signals.monthlyVolume))
    : 0;

  const quote = recommendQuote({ apis, estMonthlyVolume: volume });

  // per_request = 経済合理が立たない少量利用者。license を勧めない(§3.1)。
  if (quote.recommendedSku === "per_request") return null;

  return {
    sku: quote.recommendedSku,
    reason: quote.breakEvenNote,
    quote_url: QUOTE_ENDPOINT_URL,
    checkout_url: `${PRICING_PAGE_URL}#${quote.recommendedSku}`,
    procurement_docs_url: PROCUREMENT_DOCS_URL,
    availability: "available_now",
  };
}

/**
 * license surface イベントを Analytics Engine に記録する(funnel 計測の surface 段、§6)。
 *
 * PII 非保持(license key・email・customerId・生 API キーは書かない)。
 * 既存 analytics.ts の per-request schema とは別イベント(index = "license_surface")として
 * 記録し、weekly aggregator で funnel(surface→quote→checkout→paid)の起点に使う。
 *
 * 失敗はレスポンスに影響させない(呼出側で try-catch、または本関数内で握りつぶし)。
 *
 * blobs:
 *   0: イベント種別  "license_surface"
 *   1: 提示 SKU      hub_pro / hub_enterprise / address_managed
 *   2: API context   calendar / address / text / corporation
 *   3: 現プラン      free / starter / pro / enterprise / anonymous
 * doubles:
 *   0: 有償 cross-API 数
 *   1: 月間 volume
 * indexes: ["license_surface"]
 *
 * @param dataset Analytics Engine binding(未設定ならスキップ)
 * @param params 記録する surface イベントの属性(PII を含めない)
 */
export function emitLicenseSurfaceSignal(
  dataset: AnalyticsEngineDataset | undefined,
  params: {
    sku: LicenseRecommendation["sku"];
    apiContext: ApiName;
    plan: string;
    paidApiCount: number;
    monthlyVolume: number;
  }
): void {
  if (!dataset || typeof dataset.writeDataPoint !== "function") return;
  try {
    dataset.writeDataPoint({
      blobs: [LICENSE_SURFACE_INDEX, params.sku, params.apiContext, params.plan],
      doubles: [params.paidApiCount, params.monthlyVolume],
      indexes: [LICENSE_SURFACE_INDEX],
    });
  } catch (err) {
    // 計測失敗はユーザーに影響させない。
    console.error("[license-surface] writeDataPoint failed", err);
  }
}

/**
 * `LicenseRecommendation` を 429 応答の `license_recommend` ブロック(snake_case JSON)に整形する。
 *
 * @param rec 提示ブロック
 * @returns snake_case の plain object
 */
export function licenseRecommendationToJson(
  rec: LicenseRecommendation
): Record<string, unknown> {
  return {
    sku: rec.sku,
    reason: rec.reason,
    quote_url: rec.quote_url,
    checkout_url: rec.checkout_url,
    procurement_docs_url: rec.procurement_docs_url,
    availability: rec.availability,
  };
}
