/**
 * 決裁者 one-pager — 穴1 群1 §4.4
 * (order: 20260530-gap1-org-self-serve-licensing-funnel.md §4.4)
 *
 * GET /pricing/one-pager?apis=address,text&volume=500000&sla=1&dataset=0
 *
 * §4.2 の見積結果から、開発者が上司(org 決裁者)へ**そのまま転送できる 1 枚**を自動生成する。
 * 価値 + 透明価格 + entitlement + 契約までの手順を 1 ページに集約 = 営業資料を人が作らない
 * (絶対ルール 1「人間労力最小」/ ルール 5「1 対 1 営業禁止」整合)。funnel ②(発見した開発者)
 * → ③(稟議に乗せる決裁者)のブリッジ。
 *
 * 価格・推奨ロジックは src/pricing/quote.ts を single-source 参照(drift 防止)。
 *
 * ★ 本ページは見積入力でクエリが変わる**パラメータページ**のため robots=noindex。
 *   index させると param 由来の大量同質 URL が生成され、GSC の低品質判定(2026-04 事例)を
 *   再発させる。canonical な価格情報は /pricing(index 対象)が担う。
 */
import {
  recommendQuote,
  PRICING_PAGE_URL,
  PROCUREMENT_DOCS_URL,
  type QuoteInput,
  type ApiName,
} from "../pricing/quote.js";

/** API 名 → 決裁者向け日本語ラベル。 */
const API_LABELS: Record<ApiName, string> = {
  address: "住所正規化",
  text: "人名・テキスト処理",
  calendar: "暦(六曜・暦注)",
  corporation: "法人番号",
};

const yen = (n: number) => `¥${n.toLocaleString("en-US")}`;

/** one-pager 専用の最小・印刷最適 CSS(layout.ts とは独立、1 枚に収める)。 */
const ONE_PAGER_STYLES = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;
  line-height:1.7;color:#1a1a2e;background:#f1f5f9;padding:24px}
.sheet{max-width:760px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;
  padding:40px 44px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.brand{font-size:1.15rem;font-weight:700;letter-spacing:.02em}
.brand span{color:#2563eb}
.docnote{font-size:.8rem;color:#64748b;margin-top:2px}
h1{font-size:1.5rem;font-weight:700;margin:18px 0 6px;line-height:1.3}
.lead{color:#475569;font-size:.95rem;margin-bottom:22px}
h2{font-size:1.0rem;font-weight:700;margin:24px 0 10px;padding-bottom:6px;border-bottom:2px solid #e5e7eb}
ul,ol{margin:0 0 8px 22px}
li{margin-bottom:5px}
.plan{background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:20px 22px;margin:8px 0 4px}
.plan .name{font-size:1.1rem;font-weight:700}
.plan .price{font-size:1.9rem;font-weight:700;margin:4px 0}
.plan .price small{font-size:.85rem;font-weight:400;color:#64748b}
.plan .equiv{font-size:.85rem;color:#475569}
.cond{width:100%;border-collapse:collapse;font-size:.875rem;margin-bottom:6px}
.cond th,.cond td{padding:7px 10px;border:1px solid #e5e7eb;text-align:left}
.cond th{background:#f8fafc;font-weight:600;width:38%}
.note{font-size:.85rem;color:#475569;background:#fafafa;border-left:3px solid #cbd5e1;padding:8px 12px;margin:6px 0}
.avail{font-size:.85rem;font-weight:600;padding:8px 12px;border-radius:8px;margin:10px 0}
.avail.now{background:#dcfce7;color:#166534}
.avail.soon{background:#fef9c3;color:#854d0e}
.foot{margin-top:26px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:.8rem;color:#64748b}
.foot a{color:#2563eb;text-decoration:none}
.actions{text-align:center;margin:22px 0 4px}
.btn{display:inline-block;background:#2563eb;color:#fff;padding:9px 20px;border-radius:8px;
  font-size:.9rem;border:none;cursor:pointer}
@media print{
  body{background:#fff;padding:0}
  .sheet{border:none;box-shadow:none;max-width:none;padding:0}
  .actions{display:none}
  .plan{background:#eff6ff !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`;

/** 契約までの手順を availability 別に返す。 */
function contractSteps(availabilityNow: boolean): string {
  if (availabilityNow) {
    return `
    <ol>
      <li><strong>今すぐ利用開始可</strong>:従量課金(per-request)で API キーを発行(契約・稟議なしで着手可能)。</li>
      <li><a href="${PRICING_PAGE_URL}">透明価格ページ</a>で Free 枠・段階単価を確認。</li>
      <li>規模が拡大したら本ページを再取得 → license が有利になった時点で切替を検討。</li>
      <li>技術的な不明点は <code>/api/v1/pricing/quote</code> と OpenAPI 仕様を AI エージェントに渡せば即回答が得られます(営業対応不要)。</li>
    </ol>`;
  }
  return `
    <ol>
      <li><strong>調達・法務文書を確認</strong>:<a href="${PROCUREMENT_DOCS_URL}">特定商取引法に基づく表記</a> / <a href="https://shirabe.dev/terms">利用規約</a> / <a href="https://shirabe.dev/privacy">プライバシーポリシー</a>(個別 MSA 交渉は不要、そのまま稟議に乗せられます)。</li>
      <li><a href="${PRICING_PAGE_URL}">透明価格ページ</a>で SKU・entitlement を最終確認。</li>
      <li><strong>flat license の self-serve 申込は 2026 年 6 月開通予定</strong>。それまでは本見積 + 上記文書で社内稟議を進められます。</li>
      <li>開通後は AI エージェント経由でも license を initiate 可能(支払い authorize の 1 回のみ人手)。</li>
    </ol>`;
}

/**
 * 見積入力から決裁者 one-pager の HTML を生成する。
 *
 * @param input 見積入力(quote endpoint と同一の正規化済み入力)
 * @returns 印刷最適・noindex の 1 ページ HTML
 */
export function renderOnePager(input: QuoteInput): string {
  const quote = recommendQuote(input);
  const apis = Array.from(new Set(input.apis ?? []));
  const volume = Number.isFinite(input.estMonthlyVolume) ? Math.max(0, Math.floor(input.estMonthlyVolume)) : 0;
  const isPerRequest = quote.recommendedSku === "per_request";
  const availabilityNow = quote.availability === "available_now";

  const planName = isPerRequest ? "従量課金(per-request)" : titleForSku(quote.recommendedSku);
  const priceBlock = isPerRequest
    ? `<div class="price">従量課金<small> / 使った分だけ(license 契約不要)</small></div>`
    : `<div class="price">${yen(quote.monthlyPriceJpy!)}<small> / 月(税抜)</small></div>` +
      (quote.perRequestEquivalentJpy !== null
        ? `<div class="equiv">想定 ${volume.toLocaleString("en-US")} req/月 で実効 約 ¥${quote.perRequestEquivalentJpy}/req 相当</div>`
        : "");

  const apiList = apis.length > 0
    ? apis.map((a) => API_LABELS[a]).join("、")
    : "未指定(従量の少量利用を想定)";

  const entitlements = quote.entitlements.map((e) => `      <li>${e}</li>`).join("\n");

  const body = `
  <div class="sheet">
    <div class="brand">Shirabe<span>.</span></div>
    <div class="docnote">導入見積サマリー(稟議用)— 発行: shirabe.dev / 株式会社テックウェル</div>

    <h1>${planName} のご提案</h1>
    <p class="lead">
      Shirabe は日本特化の B2B identifier API プラットフォームです(住所・人名・暦・法人番号)。
      デジタル庁 ABR 準拠の canonical データを基盤に、<strong>透明価格 + self-serve</strong> で提供します
      (お問い合わせ・相見積もり不要)。本書は実際の利用条件に基づく自動見積です。
    </p>

    <h2>想定利用条件</h2>
    <table class="cond">
      <tr><th>利用 API</th><td>${apiList}</td></tr>
      <tr><th>想定月間リクエスト</th><td>${volume.toLocaleString("en-US")} req/月</td></tr>
      <tr><th>SLA(可用性保証)</th><td>${input.needSla ? "要" : "不要"}</td></tr>
      <tr><th>dataset(bulk/オフライン)</th><td>${input.needDataset ? "要" : "不要"}</td></tr>
    </table>

    <h2>推奨プランと費用</h2>
    <div class="plan">
      <div class="name">${planName}</div>
      ${priceBlock}
    </div>
    <div class="note">${quote.breakEvenNote}</div>

    <h2>含まれるもの</h2>
    <ul>
${entitlements}
    </ul>

    <h2>契約までの手順</h2>
    ${contractSteps(availabilityNow)}
    <div class="avail ${availabilityNow ? "now" : "soon"}">
      ${availabilityNow
        ? "✓ 今すぐ利用開始できます(従量課金、API キー即発行)。"
        : "ⓘ flat license の self-serve 申込導線は 2026 年 6 月開通予定。それまでは本見積 + 公開文書で稟議を進められます(誇張せず正直に記載)。"}
    </div>

    <div class="actions">
      <button class="btn" onclick="window.print()">この見積を印刷 / PDF 保存</button>
    </div>

    <div class="foot">
      透明価格ページ: <a href="${PRICING_PAGE_URL}">${PRICING_PAGE_URL}</a> ／
      調達・法務文書: <a href="${PROCUREMENT_DOCS_URL}">${PROCUREMENT_DOCS_URL}</a><br>
      運営: 株式会社テックウェル(福岡)／ 本見積は AI エージェント・開発者が認証なしで取得した透明見積です。
    </div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>導入見積サマリー(稟議用)— Shirabe</title>
<meta name="description" content="Shirabe 導入の稟議用 1 枚サマリー(推奨プラン・透明価格・含まれるもの・契約までの手順)。自動見積から生成。">
<meta name="robots" content="noindex,follow">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>S</text></svg>">
<style>${ONE_PAGER_STYLES}</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** SKU id → 表示名(quote.entitlements とは別に見出し用)。 */
function titleForSku(sku: string): string {
  switch (sku) {
    case "address_managed":
      return "Shirabe Address Managed";
    case "hub_pro":
      return "Shirabe Hub Pro";
    case "hub_enterprise":
      return "Shirabe Hub Enterprise";
    default:
      return "従量課金(per-request)";
  }
}
