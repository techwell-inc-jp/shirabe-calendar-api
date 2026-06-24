/**
 * 透明価格ページ(hub 集約)— 穴1 群1 §4.1
 * (order: 20260530-gap1-org-self-serve-licensing-funnel.md §4.1)
 *
 * GET /pricing — B2B 4 大 identifier hub の license SKU を透明掲載 + per-request 比較 +
 * 即時自動見積 endpoint の案内 + 調達(法務)文書導線。
 *
 * 競合全社が「お問い合わせ→見積」の人間営業 motion の中、価格を公開すること自体が差別化
 * (monetization §7.7)。AI 引用面でも「価格が answerable」= citation 価値。
 * 価格は src/pricing/quote.ts の SKUS を single-source として参照(drift 防止)。
 */
import { renderSEOPage } from "./layout.js";
import {
  SKUS,
  ADDRESS_MANAGED_BREAK_EVEN_REQ,
  HUB_PRO_BREAK_EVEN_REQ,
  REFERENCE_PER_REQUEST_RATE_JPY,
} from "../pricing/quote.js";

const CANONICAL = "https://shirabe.dev/pricing";

const KEYWORDS = [
  "Shirabe 料金",
  "日本特化 API 料金",
  "B2B identifier API pricing",
  "住所正規化 API 料金",
  "Hub license Japan",
  "OpenAPI pricing Japan",
  "AI エージェント API 料金",
].join(", ");

const yen = (n: number) => `¥${n.toLocaleString("en-US")}`;

/** JSON-LD: 3 license SKU を Offer として構造化(AI が価格を取得可能に)。 */
const OFFER_CATALOG_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "OfferCatalog",
  "@id": "https://shirabe.dev/pricing#license-catalog",
  name: "Shirabe Hub License Plans",
  url: CANONICAL,
  itemListElement: Object.values(SKUS).map((sku) => ({
    "@type": "Offer",
    name: sku.name,
    priceCurrency: "JPY",
    price: String(sku.monthlyPriceJpy),
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: String(sku.monthlyPriceJpy),
      priceCurrency: "JPY",
      unitText: "MONTH",
      billingIncrement: 1,
    },
    description: sku.summary,
    category: "API license (flat monthly)",
  })),
};

/**
 * SKU カードの framing メタ(価格 dial: ¥40k 入口 → ¥120k 横断利用 → ¥280k 機会対応)。
 * 価格は SKUS を single-source に保ち、ここでは「始め方の位置づけ」のみを定義する。
 * (v1.12 2026-06-24: 単独 per-API が主経路 / Hub License は二次。¥40k 入口 + ¥120k 横断利用(quote 自動アップセル)+ ¥280k 機会対応)
 */
const SKU_FRAMING: Record<
  keyof typeof SKUS,
  { badge: string; badgeClass: string; highlight: boolean; lead: string }
> = {
  address_managed: {
    badge: "入口・まずここから",
    badgeClass: "badge-green",
    highlight: false,
    lead: "単一 API(住所)から self-serve で始める on-ramp。",
  },
  hub_pro: {
    badge: "横断利用はこれ",
    badgeClass: "badge-blue",
    highlight: true,
    lead: "2 API 以上を横断利用するなら見積が自動でここを提示。複数 API を 1 key に集約する横断利用プラン(単独購入の上に乗る二次オプション)。",
  },
  hub_enterprise: {
    badge: "大規模・機会対応",
    badgeClass: "badge-gray",
    highlight: false,
    lead: "MDM / CRM 規模・dataset 要件がある場合のみ。",
  },
};

/** SKU カードの HTML を生成する(framing バッジ + 横断利用プランの強調つき)。 */
function skuCard(skuKey: keyof typeof SKUS): string {
  const sku = SKUS[skuKey];
  const f = SKU_FRAMING[skuKey];
  const items = sku.entitlements.map((e) => `      <li>${e}</li>`).join("\n");
  const cardStyle = f.highlight
    ? ' style="border:2px solid #2563eb;box-shadow:0 4px 12px rgba(37,99,235,.12)"'
    : "";
  return `
  <div class="card" id="${sku.id}"${cardStyle}>
    <span class="badge ${f.badgeClass}">${f.badge}</span>
    <h3 style="margin:10px 0 8px">${sku.name}</h3>
    <p style="font-size:1.5rem;font-weight:700;margin:.25rem 0">${yen(sku.monthlyPriceJpy!)}<span style="font-size:.875rem;font-weight:400;color:#64748b"> / 月(税抜)</span></p>
    <p class="text-muted" style="font-size:.8125rem;margin-bottom:8px">${f.lead}</p>
    <p class="text-muted">${sku.summary}</p>
    <ul>
${items}
    </ul>
  </div>`;
}

/**
 * 透明価格ページの HTML を生成する。
 */
export function renderPricingPage(): string {
  const body = `
<div class="hero">
  <h1>料金 — Shirabe Hub License</h1>
  <p class="tagline">透明価格 + self-serve。お問い合わせ・見積依頼は不要です。</p>
  <p class="desc">
    日本特化 API プラットフォーム Shirabe の料金を全て公開しています。<br>
    <strong>各 API は単独の従量課金(per-request)で利用・購入できます</strong>。住所＋人名＋暦＋法人番号を横断利用する場合は、1 key にまとめる Hub License(${yen(SKUS.address_managed.monthlyPriceJpy!)} の Address Managed から)も選べ、利用が増えれば見積が自動で Hub Pro(${yen(SKUS.hub_pro.monthlyPriceJpy!)})を提示します。<br>
    少量利用は従量課金(per-request)のまま。どのプランが最適かは <a href="#quote">即時自動見積</a> が秒で返します(営業ゼロ)。
  </p>
</div>

<!-- License SKU -->
<section class="section">
  <h2>Hub License プラン(月額固定)</h2>
  <p class="text-muted" style="font-size:.875rem">
    B2B 4 大 identifier(住所・人名・暦・法人番号)を 1 契約 1 key で。価格は税抜。
    <strong>単独利用が基本</strong>です — 単一 API なら per-request または入口の Address Managed、2 API 以上を横断利用するなら Hub Pro、大規模 MDM / CRM のみ Hub Enterprise。
    flat license の self-serve 申込は開通済み。下記 <a href="#quote">見積</a> で最適 SKU を確認のうえそのまま申込でき、<a href="/legal">調達文書</a>は稟議にそのまま乗せられます。
  </p>
  <div class="grid grid-2">
${skuCard("address_managed")}
${skuCard("hub_pro")}
${skuCard("hub_enterprise")}
  </div>
</section>

<!-- per-request 比較 -->
<section class="section">
  <h2>従量課金(per-request)との比較</h2>
  <p>
    少量〜中規模、または単発利用なら従量課金が最も経済的です。license は経済合理が立つ規模で初めて有利になります(無理な提示はしません)。
  </p>
  <table>
    <thead>
      <tr><th>状況</th><th>推奨</th><th>理由</th></tr>
    </thead>
    <tbody>
      <tr><td>単発 / 少量</td><td>従量(per-request)</td><td>各 API に Free 枠 + 段階単価。<a href="/upgrade">従量プラン →</a></td></tr>
      <tr><td>住所単体で月 ${ADDRESS_MANAGED_BREAK_EVEN_REQ.toLocaleString("en-US")} req 以上</td><td>Address Managed(${yen(SKUS.address_managed.monthlyPriceJpy!)})</td><td>予測可能な固定費化が有利(住所 Pro ¥${REFERENCE_PER_REQUEST_RATE_JPY}/req 基準の break-even)</td></tr>
      <tr><td>2 API 以上を横断 / SLA 要</td><td>Hub Pro(${yen(SKUS.hub_pro.monthlyPriceJpy!)})</td><td>1 key で bundle + SLA + risk 移転。break-even 約 ${HUB_PRO_BREAK_EVEN_REQ.toLocaleString("en-US")} req/月</td></tr>
      <tr><td>大規模 MDM / CRM・dataset 要</td><td>Hub Enterprise(${yen(SKUS.hub_enterprise.monthlyPriceJpy!)})</td><td>custom SLA + 専用窓口 + dataset snapshot</td></tr>
    </tbody>
  </table>
</section>

<!-- 即時自動見積 -->
<section class="section">
  <h2 id="quote">即時自動見積(AI-callable、認証不要)</h2>
  <p>
    利用する API と想定 volume を渡すと、最適プラン・月額・per-request 換算・break-even 根拠・entitlement を JSON で即返します。
    AI エージェントが org 代理で「いくら / 何が付くか」を取得できます。
  </p>
  <pre><code># cross-API(住所 + 人名)を月 50 万 req 想定で見積
curl "https://shirabe.dev/api/v1/pricing/quote?apis=address,text&volume=500000"

# JSON body でも可(SLA / dataset 要件を指定)
curl -X POST https://shirabe.dev/api/v1/pricing/quote \\
  -H "Content-Type: application/json" \\
  -d '{"apis":["address","text"],"est_monthly_volume":500000,"need_sla":true}'</code></pre>
  <p class="text-muted" style="font-size:.875rem">
    レスポンス: <code>recommended_sku</code> / <code>monthly_price_jpy</code> / <code>per_request_equivalent_jpy</code> /
    <code>break_even_note</code> / <code>entitlements</code> / <code>checkout_url</code> / <code>procurement_docs_url</code> /
    <code>availability</code> / <code>one_pager_url</code>。
  </p>
  <p class="text-muted" style="font-size:.875rem">
    <code>one_pager_url</code> は、見積結果を<strong>上司へ転送できる稟議用 1 枚</strong>(価値・透明価格・含まれるもの・契約手順)に変換した URL です。営業資料の作成は不要です。
  </p>
</section>

<!-- 調達・法務 -->
<section class="section">
  <h2>調達・契約文書(稟議用、個別交渉なし)</h2>
  <p>
    standard 文書を公開しています。個別 MSA 交渉は不要で、そのまま稟議に乗せられます。
  </p>
  <ul>
    <li><a href="/legal">特定商取引法に基づく表記(事業者情報)</a></li>
    <li><a href="/terms">利用規約</a></li>
    <li><a href="/privacy">プライバシーポリシー</a></li>
  </ul>
  <p class="text-muted" style="font-size:.875rem">
    ※ SLA 規定・DPA 等の詳細文書は順次公開予定。flat license の self-serve 申込導線は開通済み(AI エージェントは <code>POST /api/v1/licenses/checkout</code> で Stripe Checkout URL を取得可能)。
  </p>
</section>

<!-- 運営 -->
<section class="section text-muted" style="font-size:.875rem">
  <p>運営: 株式会社テックウェル(福岡)</p>
</section>
`;

  return renderSEOPage({
    title: "料金 — Shirabe Hub License(透明価格・self-serve)",
    description:
      "Shirabe の料金を全公開。従量課金(per-request)と Hub License(Address Managed ¥40,000 / Hub Pro ¥120,000 / Hub Enterprise ¥280,000、月額固定)。AI-callable な即時自動見積 endpoint あり。",
    body,
    canonicalUrl: CANONICAL,
    keywords: KEYWORDS,
    jsonLd: [OFFER_CATALOG_LD],
  });
}
