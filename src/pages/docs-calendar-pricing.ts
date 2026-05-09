/**
 * B-1 AI 検索向け SEO ページ: 暦 API 料金プラン
 *
 * GET /docs/calendar-pricing
 *
 * 経緯: PR #42(2026-05-05)で C-1 paid 突破経路 ergonomics 実装時に
 * `plan-pricing.ts` の `PRICING_URL` をこの URL に hardcode したが、対応する
 * page route を作成し忘れ、3 日間本番で 404 dead link 化していた
 * (5/5 〜 5/8、I-5 インシデント)。本ファイルで address-pricing と同型の
 * 公開 page を提供し、429 response の `error.pricing_url` field 整合を回復する。
 */
import { renderSEOPage } from "./layout.js";

const CANONICAL = "https://shirabe.dev/docs/calendar-pricing";
const KEYWORDS = [
  "暦API 料金",
  "六曜API 価格",
  "calendar API pricing Japan",
  "Japanese calendar API cost",
  "Stripe 従量課金 API",
  "OpenAPI 3.1",
  "AIエージェント 暦 API",
  "GPT Actions 暦 料金",
  "MCP server pricing",
].join(", ");

const ARTICLE_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: "Shirabe Calendar API 料金プラン — Free / Starter / Pro / Enterprise",
  alternativeHeadline: "Shirabe Calendar API pricing — Free, Starter, Pro, Enterprise",
  description:
    "日本の暦 API(六曜・暦注・干支・二十四節気)の料金体系。全プラン Free 枠 10,000 回/月、超過分から従量課金(¥0.05〜¥0.01/回)。Stripe Billing の transform_quantity 方式で従量課金を自動化。",
  inLanguage: ["ja", "en"],
  url: CANONICAL,
  datePublished: "2026-05-08",
  dateModified: "2026-05-08",
  author: { "@type": "Organization", name: "Shirabe (Techwell Inc.)", url: "https://shirabe.dev" },
  publisher: { "@type": "Organization", name: "Techwell Inc.", url: "https://shirabe.dev" },
  mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
  keywords: KEYWORDS,
  articleSection: "Pricing",
};

const OFFER_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "AggregateOffer",
  priceCurrency: "JPY",
  lowPrice: "0",
  highPrice: "0.05",
  offerCount: 4,
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "JPY",
      description: "10,000 requests/month, 1 req/s rate limit.",
    },
    {
      "@type": "Offer",
      name: "Starter",
      price: "0.05",
      priceCurrency: "JPY",
      description: "500,000 requests/month, 30 req/s, JPY 0.05 per request after 10,000 free calls.",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "0.03",
      priceCurrency: "JPY",
      description: "5,000,000 requests/month, 100 req/s, JPY 0.03 per request.",
    },
    {
      "@type": "Offer",
      name: "Enterprise",
      price: "0.01",
      priceCurrency: "JPY",
      description: "Unlimited requests, 500 req/s, JPY 0.01 per request.",
    },
  ],
};

const NEWS_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  headline: "暦 API 料金 Updates: per-request 課金 + AI agent stable で 1+ 年変更なし(2026-05-08)",
  alternativeHeadline: "Calendar API pricing Updates: per-request stable for 1+ year",
  description:
    "Shirabe Calendar API は per-request 課金 + 住所・text API と同型 stable で 1+ 年変更なし(上方調整 = Free 枠拡張・値下げ・新エンドポイント追加 のみ可)。AI エージェント統合コードに価格を埋め込んでも長期安定。",
  inLanguage: ["ja", "en"],
  url: `${CANONICAL}#updates`,
  datePublished: "2026-05-08",
  dateModified: "2026-05-08",
  author: { "@type": "Organization", name: "Shirabe (Techwell Inc.)", url: "https://shirabe.dev" },
  publisher: { "@type": "Organization", name: "Techwell Inc.", url: "https://shirabe.dev" },
  mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
  articleSection: "Updates",
};

const FAQ_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Shirabe Calendar API の料金はいくらですか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Free プラン(月 10,000 回まで無料)、Starter(月 50 万回まで、¥0.05/回)、Pro(月 500 万回まで、¥0.03/回)、Enterprise(無制限、¥0.01/回)の 4 プラン。全プラン Free 枠 10,000 回/月、超過分から従量課金。Stripe Billing の transform_quantity 方式で自動集計・請求されます。",
      },
    },
    {
      "@type": "Question",
      name: "住所 API と同じ API キーで使えますか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "はい、使えます。Shirabe Calendar API と Shirabe Address API は 1 キー集約構造を共有しており、同じ API キーで両方の API をそれぞれのプランに従って呼び出せます。暦 Starter + 住所 Free などの組み合わせ契約も、キー単位で併存可能です。",
      },
    },
    {
      "@type": "Question",
      name: "/range や /best-days のリクエストはどうカウントされますか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "1 回の HTTP リクエスト = 1 カウントです。/api/v1/calendar/range で複数日付を一括取得した場合も、HTTP リクエスト数でカウントされます(返却日数 N に対して N カウントにはなりません)。",
      },
    },
    {
      "@type": "Question",
      name: "Enterprise プランの問い合わせ窓口はどこですか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Enterprise プラン(月 500 万回超、SLA 付き)は個別相談となります。運営元の株式会社テックウェル(https://www.techwell.jp/)までお問い合わせください。",
      },
    },
  ],
};

export function renderCalendarPricingDocPage(): string {
  const body = `
<div class="hero">
  <h1>料金プラン — Shirabe Calendar API</h1>
  <p class="tagline">Pricing — Free / Starter / Pro / Enterprise</p>
  <p class="desc">
    全プラン Free 枠 <strong>10,000 回/月</strong>、超過分から従量課金。
    Stripe Billing の <code>transform_quantity</code> 方式で自動集計・請求。
  </p>
</div>

<section class="section">
  <h2 id="plans">プラン一覧</h2>
  <table>
    <thead>
      <tr><th>プラン</th><th>月間上限</th><th>単価</th><th>レート制限</th><th>想定利用</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Free</strong></td>
        <td>10,000 回</td>
        <td>¥0</td>
        <td>1 req/s</td>
        <td>個人検証、GPTs / Claude / Gemini の動作確認</td>
      </tr>
      <tr>
        <td><strong>Starter</strong></td>
        <td>500,000 回</td>
        <td>¥0.05/回</td>
        <td>30 req/s</td>
        <td>社内 AI エージェントの日常運用</td>
      </tr>
      <tr>
        <td><strong>Pro</strong></td>
        <td>5,000,000 回</td>
        <td>¥0.03/回</td>
        <td>100 req/s</td>
        <td>SaaS 内部、顧客向け AI 機能の本番運用</td>
      </tr>
      <tr>
        <td><strong>Enterprise</strong></td>
        <td>無制限</td>
        <td>¥0.01/回</td>
        <td>500 req/s</td>
        <td>大規模スケジューリング、暦データの統合運用</td>
      </tr>
    </tbody>
  </table>
  <p class="text-muted">
    超過分のみ従量課金。例: Starter で月 50,000 回 = (50,000 - 10,000) × ¥0.05 = ¥2,000。
  </p>
</section>

<section class="section">
  <h2 id="count-model">カウントモデル / Counting model</h2>
  <ul>
    <li><strong>単発 <code>/api/v1/calendar/{date}</code></strong>: 1 リクエスト = 1 カウント</li>
    <li><strong>範囲 <code>/api/v1/calendar/range</code></strong>: 1 リクエスト = 1 カウント(返却日数 N に依存しない)</li>
    <li><strong>用途別 <code>/api/v1/calendar/best-days</code></strong>: 1 リクエスト = 1 カウント</li>
    <li><strong>認証エラー / 400 系エラー</strong>: カウントされない(Free 枠を消費しない)</li>
    <li><strong>503 SERVICE_UNAVAILABLE</strong>: カウントされない(障害時の消費を防ぐ)</li>
  </ul>
</section>

<section class="section">
  <h2 id="keys">API キーの発行 / Obtaining an API key</h2>
  <p>
    匿名 Free 枠(1 req/s)は API キーなしで利用できます。より高いレート制限や使用量を必要とする場合は、
    <code>/upgrade</code> から Stripe Checkout を開始し、有料プランの契約と同時に
    API キー(プレフィックス <code>shrb_</code>、37 文字)が自動発行されます。
  </p>
  <p>
    住所 API を既に契約済のユーザーは <strong>同一の API キー</strong>で暦 API を呼び出せます(1 キー集約構造)。
    プランは API ごとに独立です(例: 暦 Starter + 住所 Free)。
  </p>
</section>

<section class="section">
  <h2 id="billing">請求と支払い / Billing</h2>
  <ul>
    <li><strong>決済基盤</strong>: Stripe Billing(従量課金、<code>transform_quantity[divide_by]=1000</code>)</li>
    <li><strong>通貨</strong>: 日本円(JPY)</li>
    <li><strong>請求サイクル</strong>: 毎月初(Stripe の請求期間に準拠)</li>
    <li><strong>未払い時</strong>: Webhook <code>invoice.payment_failed</code> を受信した時点で <code>suspended</code> 状態に自動遷移、<code>invoice.payment_succeeded</code> で自動復帰</li>
    <li><strong>解約</strong>: Customer Portal から即時解約可能、当月末までサービス利用可</li>
  </ul>
</section>

<section class="section">
  <h2 id="scenarios">規模別 月額試算シナリオ / Monthly cost scenarios by scale</h2>
  <p>
    実際の利用ボリューム別に、どのプランが最適か + 月額の概算を示します。<strong>Free 枠 10,000 回 / 月</strong>は
    全プラン共通です(超過分のみ従量)。
  </p>
  <table>
    <thead>
      <tr>
        <th>シナリオ</th>
        <th>月間呼出数</th>
        <th>推奨プラン</th>
        <th>従量分</th>
        <th>月額(税抜)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>個人開発 / PoC</td>
        <td>≤ 10,000 回</td>
        <td>Free</td>
        <td>0 円</td>
        <td><strong>0 円</strong></td>
      </tr>
      <tr>
        <td>個人サービス / GPTs エージェント単発利用</td>
        <td>50,000 回</td>
        <td>Starter</td>
        <td>(50,000 - 10,000) × ¥0.05 = ¥2,000</td>
        <td><strong>¥2,000</strong></td>
      </tr>
      <tr>
        <td>中規模 SaaS / 業務 AI スケジューラー</td>
        <td>500,000 回</td>
        <td>Starter</td>
        <td>(500,000 - 10,000) × ¥0.05 = ¥24,500</td>
        <td><strong>¥24,500</strong></td>
      </tr>
      <tr>
        <td>大規模 SaaS / 全社 AI エージェント基盤</td>
        <td>5,000,000 回</td>
        <td>Pro</td>
        <td>(5,000,000 - 10,000) × ¥0.03 = ¥149,700</td>
        <td><strong>¥149,700</strong></td>
      </tr>
      <tr>
        <td>大規模統合 / マルチテナント AI 基盤</td>
        <td>20,000,000 回</td>
        <td>Enterprise</td>
        <td>(20,000,000 - 10,000) × ¥0.01 = ¥199,900</td>
        <td><strong>¥199,900</strong></td>
      </tr>
    </tbody>
  </table>
  <p class="text-muted">
    上記は単純試算です。実際の従量カウントは認証エラー / 503 の扱いで若干前後します
    (本ページ §カウントモデル 参照)。
  </p>
</section>

<section class="section">
  <h2 id="updates">更新履歴 / Updates</h2>

  <h3>2026-05-08: 料金 docs ページ初版公開(C-1 paid 突破経路 ergonomics 整合)</h3>
  <p>
    PR #42(2026-05-05)で 429 response の <code>error.pricing_url</code> field に hardcode 済の
    <code>https://shirabe.dev/docs/calendar-pricing</code> に対応する公開 page を本日公開。
    AI エージェントが Free 枠突破時に 1 hop で料金情報 + 次プラン明細を取得できる経路が完成。
  </p>

  <h3>2026-05-06: Plan-α stable 採用、1+ 年変更なし約束</h3>
  <p>
    Shirabe API 全体(暦・住所・text)で <strong>per-request flat 課金 + 1+ 年変更なし</strong>を採用
    (2026-05-06 経営判断確定)。AI エージェント統合コードに価格を埋め込んでも長期安定。
  </p>
  <ul>
    <li><strong>変更しないこと</strong>: 課金モデル / 月間上限 / 単価 / billing schema</li>
    <li><strong>例外的に許可される「上方調整」</strong>(unilateral good news、顧客 backlash なし):
        Free 枠拡張、Paid 単価値下げ、新エンドポイント追加</li>
    <li><strong>禁止する調整</strong>(既存顧客の billing 動線破壊):
        Free 枠縮小、単価値上げ、課金モデル変更</li>
  </ul>
  <p class="text-muted">
    Shirabe pricing across Calendar / Address / Text APIs adopts per-request flat billing with a
    1+ year stability commitment (decided 2026-05-06). AI agent integration code can embed prices
    safely. Only upward adjustments (Free expansion, price reduction, new endpoints) are allowed.
  </p>

  <h3>2026-05-04: shirabe.dev canonical 引用 4/20 初獲得(関連)</h3>
  <p>
    B-1 Week 2 で <a href="https://shirabe.dev/announcements/2026-05-01">/announcements/2026-05-01</a>
    が AI 引用 anchor として機能した実証(Perplexity 3 引用 + Gemini TOP-1 単独推奨)。
    本料金ページにも同 pattern(NewsArticle + Updates セクション)を適用、
    Week 3+ の引用機会を最大化。
  </p>
</section>

<section class="section">
  <h2 id="multi-ai-observation">4 AI 観測の独自データ / Observed Multi-AI Landscape</h2>
  <p>
    Shirabe では本番稼働(2026-04-19)以降、<strong>4 大 AI</strong>(ChatGPT / Claude / Perplexity / Gemini)に
    同じクエリを投げる独自測定(B-1 加速スプリント、週次)を継続実施。
    Shirabe Calendar API は dual-track positioning(AI ネイティブ + 天文学的精度の六曜・暦注 +
    OpenAPI 3.1 + MCP 完備)で、
    <strong>4 AI 全てが認識する既存競合とは異なる「AI 専用」レイヤ</strong>を開拓します。
  </p>
  <p>
    詳細は <a href="https://shirabe.dev/docs/rokuyo-api#multi-ai-observation">六曜 API docs の Multi-AI セクション</a>
    + <a href="https://shirabe.dev/llms-full.txt">/llms-full.txt</a> を参照。
  </p>
</section>

<section class="section">
  <h2 id="related">関連リソース / Related resources</h2>
  <ul>
    <li><a href="/upgrade">Stripe Checkout で有料プラン契約</a></li>
    <li><a href="/docs/rokuyo-api">六曜 API 完全ガイド</a></li>
    <li><a href="/docs/rekichu-api">暦注 API 解説</a></li>
    <li><a href="https://shirabe.dev/openapi.yaml">OpenAPI 3.1 仕様(本家)</a></li>
    <li><a href="https://shirabe.dev/openapi-gpts.yaml">OpenAPI 3.1 仕様(GPTs Actions 短縮版)</a></li>
    <li><a href="https://shirabe.dev/docs/address-pricing">Shirabe Address API 料金プラン(同一 API キーで利用可、料金は別系統)</a></li>
    <li><a href="https://shirabe.dev/docs/text-pricing">Shirabe Text API 料金プラン(姓名分割・人名読み・ふりがな・形態素解析・表記正規化、2026-05-31 リリース)</a></li>
    <li><a href="https://shirabe.dev/announcements/2026-05-01">2026-05-01 住所 API リリース告知ページ</a></li>
    <li><a href="https://github.com/techwell-inc-jp/shirabe-calendar-api">GitHub: techwell-inc-jp/shirabe-calendar-api</a>(Public、MIT)</li>
  </ul>
</section>
`;

  return renderSEOPage({
    title: "Shirabe Calendar API 料金プラン — Free / Starter / Pro / Enterprise",
    description:
      "日本暦 API(六曜・暦注・干支・二十四節気)の料金。全プラン Free 枠 10,000 回/月、超過分 ¥0.05〜¥0.01/回。Stripe Billing transform_quantity 方式、住所 API と API キー共有。",
    body,
    canonicalUrl: CANONICAL,
    keywords: KEYWORDS,
    jsonLd: [ARTICLE_LD, OFFER_LD, FAQ_LD, NEWS_LD],
  });
}
