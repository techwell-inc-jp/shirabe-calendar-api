/**
 * Pricing quote logic — 穴1 群1「即時自動見積」
 * (order: shirabe-assets/implementation-orders/20260530-gap1-org-self-serve-licensing-funnel.md §4.2 / §3.2)
 *
 * org 決裁者・AI エージェントが営業ゼロで「いくら / 何が付くか」を即取得できる純粋ロジック。
 * 透明価格 + self-serve = 絶対ルール 1(人間労力最小)/ ルール 5(スケール型、1 対 1 営業禁止)整合。
 * 競合全社が「お問い合わせ→見積」の人間営業 motion の中、価格を answerable にすること自体が差別化
 * (monetization §7.7「未占有 gap」)。
 *
 * 価格は #19 確定値(Address Managed ¥40,000 / Hub Pro ¥120,000 / Hub Enterprise ¥280,000)。
 * break-even は住所 per-request Pro ¥0.3/req 基準(monetization §7.7、住所が最高 ARPU API)。
 *
 * ★ 過剰提示しない(`feedback_recommendation_discipline` 整合): 経済合理が立たない少量利用者には
 *   license を勧めず per_request を返す(§3.1)。
 */

/** ライセンス SKU 識別子。`per_request` は license 不要(従量のまま)を表す擬似 SKU。 */
export type SkuId = "address_managed" | "hub_pro" | "hub_enterprise" | "per_request";

/** Shirabe ファミリーの API 名(cross-API 判定に使用)。 */
export type ApiName = "address" | "text" | "calendar" | "corporation";

/** 見積依頼の入力。AI エージェント / 開発者が JSON で渡す。 */
export interface QuoteInput {
  /** 有料利用(予定)の API。cross-API 判定の母集団。 */
  apis: readonly ApiName[];
  /** 全 API 合算の月間想定リクエスト数。 */
  estMonthlyVolume: number;
  /** SLA(可用性保証 / 責任範囲)が必要か。 */
  needSla?: boolean;
  /** dataset snapshot(bulk / オフライン利用)が必要か。 */
  needDataset?: boolean;
}

/** SKU の静的定義。 */
export interface Sku {
  id: SkuId;
  /** 表示名。 */
  name: string;
  /** 月額(円)。`per_request` は従量のため null。 */
  monthlyPriceJpy: number | null;
  /** 1 行サマリ。 */
  summary: string;
  /** 含まれる権利。決裁者 one-pager / 価格ページで提示。 */
  entitlements: string[];
}

/** 見積結果。`/api/v1/pricing/quote` のレスポンス本体(snake_case で JSON 化)。 */
export interface Quote {
  recommendedSku: SkuId;
  /** 推奨 SKU の月額(円)。per_request は null。 */
  monthlyPriceJpy: number | null;
  /** 月額 ÷ 想定 volume = 実効 ¥/req。比較用。volume 0 や per_request は null。 */
  perRequestEquivalentJpy: number | null;
  /** 推奨理由 + break-even の説明(透明性のため必ず添える)。 */
  breakEvenNote: string;
  /** 推奨 SKU の entitlement。 */
  entitlements: string[];
  /** 調達開始 URL(透明価格ページ)。 */
  checkoutUrl: string;
  /** 法務・調達文書 URL(稟議用)。 */
  procurementDocsUrl: string;
  /**
   * self-serve 調達の現在の利用可否。
   * - per_request: 今すぐ self-issue 可能
   * - flat license: backend(#19、2026-06 開通)経由で self-issue
   * 動かない導線を「今すぐ契約可」と偽らないため明示(`feedback_verify_before_assert` 整合)。
   */
  availability: "available_now" | "self_serve_opening_2026_06";
}

/** 住所 per-request Pro 単価(円/req)。break-even 算定の基準(monetization §7.7)。 */
export const REFERENCE_PER_REQUEST_RATE_JPY = 0.3;

/** 透明価格ページ(調達の入口)。 */
export const PRICING_PAGE_URL = "https://shirabe.dev/pricing";
/** 法務・調達文書(特商法表記 / 利用規約 / SLA 等)。 */
export const PROCUREMENT_DOCS_URL = "https://shirabe.dev/legal";

/**
 * SKU 静的定義(#19 確定価格 + monetization §「3-tier」§7.7 の entitlement テーマ)。
 * per_request は擬似 SKU のため含めない。
 */
export const SKUS: Record<Exclude<SkuId, "per_request">, Sku> = {
  address_managed: {
    id: "address_managed",
    name: "Shirabe Address Managed",
    monthlyPriceJpy: 40_000,
    summary: "住所正規化を予測可能な月額固定で。中小規模 SaaS 向けの ops offload。",
    entitlements: [
      "住所正規化 API(abr-geocoder / ABR 準拠、全 47 都道府県)月額固定",
      "予測可能な flat 月額(従量の変動 base load を固定費化)",
      "基本 SLA(稼働率目標・障害連絡)",
      "CC BY 4.0 attribution の出典伝搬を標準同梱",
    ],
  },
  hub_pro: {
    id: "hub_pro",
    name: "Shirabe Hub Pro",
    monthlyPriceJpy: 120_000,
    summary: "B2B 4 大 identifier(住所・人名・暦・法人番号)を 1 契約 1 key で。SLA + risk 移転。",
    entitlements: [
      "B2B 4 大 identifier bundle(住所 + 人名/text + 暦 + 法人番号※2026-06 追加)を 1 key で横断利用",
      "SLA 99.9%(可用性保証 + 責任範囲の明文化 = risk 移転)",
      "予測可能な flat 月額(cross-API の合算変動を固定費化)",
      "出典 attribution 統一 + 正規化結果の一貫性保証",
    ],
  },
  hub_enterprise: {
    id: "hub_enterprise",
    name: "Shirabe Hub Enterprise",
    monthlyPriceJpy: 280_000,
    summary: "大規模 MDM / CRM 向け。Hub Pro 全機能 + custom SLA + 専用窓口 + dataset。",
    entitlements: [
      "Hub Pro の全 entitlement",
      "custom SLA(個別の可用性 / レイテンシ / サポート時間)",
      "専用サポート窓口",
      "dataset snapshot 利用権(bulk / オフライン名寄せ)",
    ],
  },
};

/** Address Managed の break-even req/月(月額 ÷ 基準単価)。 */
export const ADDRESS_MANAGED_BREAK_EVEN_REQ = Math.round(
  SKUS.address_managed.monthlyPriceJpy! / REFERENCE_PER_REQUEST_RATE_JPY
); // ≈ 133,333
/** Hub Pro の break-even req/月。 */
export const HUB_PRO_BREAK_EVEN_REQ = Math.round(
  SKUS.hub_pro.monthlyPriceJpy! / REFERENCE_PER_REQUEST_RATE_JPY
); // = 400,000
/** Hub Enterprise を勧める超大規模 volume 閾値(Hub Pro break-even の 2.5 倍)。 */
export const HUB_ENTERPRISE_VOLUME_THRESHOLD_REQ = HUB_PRO_BREAK_EVEN_REQ * 2.5; // = 1,000,000

/** flat license の self-serve checkout が開通する時期(#19 backend)。 */
const LICENSE_CHECKOUT_AVAILABILITY: Quote["availability"] = "self_serve_opening_2026_06";

/**
 * 数値を ¥/req(小数 4 桁)に丸める。volume 0 以下は null。
 */
function perRequestEquivalent(monthlyPriceJpy: number | null, volume: number): number | null {
  if (monthlyPriceJpy === null || volume <= 0) return null;
  return Math.round((monthlyPriceJpy / volume) * 10_000) / 10_000;
}

/**
 * 入力 signal から最適 SKU を判定し、透明な見積を返す(純粋関数)。
 *
 * 判定順(order §3.1、過剰提示回避):
 *   1. dataset 要 or 超大規模(≥ 100 万 req) → Hub Enterprise
 *   2. cross-API(2 API 以上)or SLA 要 or volume ≥ Hub Pro break-even → Hub Pro
 *   3. 住所単体 high volume(≥ Address Managed break-even) → Address Managed
 *   4. それ以外 → per_request(license を勧めない)
 *
 * @param input 見積入力
 * @returns 透明な見積(推奨 SKU・価格・break-even 根拠・entitlement・調達導線)
 */
export function recommendQuote(input: QuoteInput): Quote {
  const apis = Array.isArray(input.apis) ? input.apis : [];
  const volume = Number.isFinite(input.estMonthlyVolume) ? Math.max(0, input.estMonthlyVolume) : 0;
  const needSla = input.needSla === true;
  const needDataset = input.needDataset === true;
  const paidApiCount = new Set(apis).size;

  let sku: Sku | null;
  let note: string;

  if (needDataset || volume >= HUB_ENTERPRISE_VOLUME_THRESHOLD_REQ) {
    sku = SKUS.hub_enterprise;
    note = needDataset
      ? "dataset snapshot(bulk / オフライン名寄せ)の要件があるため Hub Enterprise を推奨。"
      : `想定 ${volume.toLocaleString("en-US")} req/月 は超大規模(${HUB_ENTERPRISE_VOLUME_THRESHOLD_REQ.toLocaleString("en-US")} req/月 超)のため Hub Enterprise を推奨。`;
  } else if (paidApiCount >= 2 || needSla || volume >= HUB_PRO_BREAK_EVEN_REQ) {
    sku = SKUS.hub_pro;
    if (paidApiCount >= 2) {
      note = `${paidApiCount} API を横断利用予定のため Hub Pro を推奨。1 契約 1 key で bundle + SLA + 予測可能な固定費化。per-request 換算の break-even は約 ${HUB_PRO_BREAK_EVEN_REQ.toLocaleString("en-US")} req/月(住所 Pro ¥${REFERENCE_PER_REQUEST_RATE_JPY}/req 基準)。`;
    } else if (needSla) {
      note = `SLA(可用性保証 / 責任範囲)の要件があるため Hub Pro を推奨。break-even は約 ${HUB_PRO_BREAK_EVEN_REQ.toLocaleString("en-US")} req/月。`;
    } else {
      note = `想定 ${volume.toLocaleString("en-US")} req/月 は Hub Pro の break-even(約 ${HUB_PRO_BREAK_EVEN_REQ.toLocaleString("en-US")} req/月、住所 Pro ¥${REFERENCE_PER_REQUEST_RATE_JPY}/req 基準)以上のため、flat 月額が有利。`;
    }
  } else if (apis.includes("address") && volume >= ADDRESS_MANAGED_BREAK_EVEN_REQ) {
    sku = SKUS.address_managed;
    note = `住所単体で想定 ${volume.toLocaleString("en-US")} req/月 は Address Managed の break-even(約 ${ADDRESS_MANAGED_BREAK_EVEN_REQ.toLocaleString("en-US")} req/月)以上のため、予測可能な固定費化が有利。`;
  } else {
    sku = null;
    note = `想定規模では従量(per-request)が最も経済的です。license は cross-API 利用・SLA 要件・住所で約 ${ADDRESS_MANAGED_BREAK_EVEN_REQ.toLocaleString("en-US")} req/月 以上で初めて有利になります。`;
  }

  if (sku === null) {
    return {
      recommendedSku: "per_request",
      monthlyPriceJpy: null,
      perRequestEquivalentJpy: null,
      breakEvenNote: note,
      entitlements: ["従量課金(使った分だけ)。各 API の Free 枠 + 段階単価。license 契約不要。"],
      checkoutUrl: PRICING_PAGE_URL,
      procurementDocsUrl: PROCUREMENT_DOCS_URL,
      availability: "available_now",
    };
  }

  return {
    recommendedSku: sku.id,
    monthlyPriceJpy: sku.monthlyPriceJpy,
    perRequestEquivalentJpy: perRequestEquivalent(sku.monthlyPriceJpy, volume),
    breakEvenNote: note,
    entitlements: sku.entitlements,
    checkoutUrl: `${PRICING_PAGE_URL}#${sku.id}`,
    procurementDocsUrl: PROCUREMENT_DOCS_URL,
    availability: LICENSE_CHECKOUT_AVAILABILITY,
  };
}

/**
 * Quote を `/api/v1/pricing/quote` のレスポンス JSON(snake_case)に整形する。
 */
export function quoteToJson(q: Quote): Record<string, unknown> {
  return {
    recommended_sku: q.recommendedSku,
    monthly_price_jpy: q.monthlyPriceJpy,
    per_request_equivalent_jpy: q.perRequestEquivalentJpy,
    break_even_note: q.breakEvenNote,
    entitlements: q.entitlements,
    checkout_url: q.checkoutUrl,
    procurement_docs_url: q.procurementDocsUrl,
    availability: q.availability,
  };
}
