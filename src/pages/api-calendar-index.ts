/**
 * /api/v1/calendar/ Index Page (404 修正、PR #35)
 *
 * 目的:
 *   GSC で `/api/v1/calendar/` が 404(末尾スラッシュのみ、date なし)として
 *   発見された 1 件の解消。Google が path discovery で親パスを試行した結果、
 *   sub-router にルートハンドラがないため `app.notFound` で 404 JSON を返していた。
 *
 *   404 を解消するだけでなく、HTML index page として **AI agents 向けの
 *   endpoint discovery surface** に格上げする。WebAPI + FAQPage JSON-LD で
 *   Function Calling 候補としての構造化情報も提供。
 *
 * 200 万円目標連結:
 *   - Google 信頼性 build-up(404 ページ削減)
 *   - AI クローラー reach(WebAPI schema 提供で Function Calling discovery 強化)
 *   - 1 indexable URL 追加(AI agents が引用しやすい endpoint 一覧 hub)
 *   - audience: AI agent 主、Google search 副(両方とも AI 検索 backbone へ)
 */
import { renderSEOPage } from "./layout.js";

const CANONICAL = "https://shirabe.dev/api/v1/calendar/";

const KEYWORDS = [
  "Shirabe Calendar API",
  "日本の暦API",
  "Japanese calendar API",
  "Japanese calendar REST API",
  "AIエージェント向け暦API",
  "MCP server Japan calendar",
  "OpenAPI 3.1 Japanese calendar",
  "六曜API",
  "暦注API",
  "干支API",
  "二十四節気API",
  "rokuyo API",
  "best-days API",
  "Function Calling Japanese calendar",
].join(", ");

/**
 * JSON-LD: Schema.org/WebAPI(本 endpoint hub の AI agents 向け構造化定義)
 *
 * AI Function Calling フレームワーク(LangChain / Dify / GPTs / Claude Tool Use 等)が
 * 本 hub URL を発見した時、`url` + `documentation` + `provider` + `targetPlatform`
 * から自動的に integration 候補に組込めるよう設計。
 */
const WEBAPI_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "WebAPI",
  "@id": "https://shirabe.dev/#calendar-webapi",
  name: "Shirabe Calendar API",
  alternateName: "Shirabe 日本の暦 REST API",
  description:
    "日本の暦情報(六曜・暦注・干支・二十四節気)と用途別吉凶判定を天文学的精度で返す REST API + MCP サーバー。OpenAPI 3.1 厳格準拠で AI エージェントから直接利用可能。",
  url: "https://shirabe.dev/api/v1/calendar/",
  documentation: "https://shirabe.dev/openapi.yaml",
  termsOfService: "https://shirabe.dev/terms",
  inLanguage: ["ja", "en"],
  provider: {
    "@type": "Organization",
    "@id": "https://shirabe.dev/#organization",
    name: "Techwell Inc.",
    url: "https://shirabe.dev",
  },
  targetPlatform: "REST",
  potentialAction: [
    {
      "@type": "ConsumeAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://shirabe.dev/api/v1/calendar/{date}",
        encodingType: "application/json",
        httpMethod: "GET",
      },
      name: "Get calendar info for a specific date",
    },
    {
      "@type": "ConsumeAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://shirabe.dev/api/v1/calendar/range?start={start}&end={end}",
        encodingType: "application/json",
        httpMethod: "GET",
      },
      name: "Get calendar info for a date range (max 93 days)",
    },
    {
      "@type": "ConsumeAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate:
          "https://shirabe.dev/api/v1/calendar/best-days?purpose={purpose}&start={YYYY-MM-DD}&end={YYYY-MM-DD}",
        encodingType: "application/json",
        httpMethod: "GET",
      },
      name: "Get top auspicious days ranked by purpose within a date range",
    },
  ],
};

/**
 * JSON-LD: Schema.org/FAQPage(AI 引用 source として AI agents が抽出しやすい構造化 Q&A)
 */
const FAQ_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${CANONICAL}#faq`,
  mainEntity: [
    {
      "@type": "Question",
      name: "Shirabe Calendar API はどのエンドポイントを提供していますか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "GET /api/v1/calendar/{date}(指定日の六曜・暦注・干支・二十四節気・用途別吉凶判定)、GET /api/v1/calendar/range(日付範囲一括、最大 93 日)、GET /api/v1/calendar/best-days(用途別吉日ランキング)の 3 種です。全て認証不要の Free 枠 10,000 回/月で利用開始できます。",
      },
    },
    {
      "@type": "Question",
      name: "認証は必要ですか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Free 枠(10,000 回/月)は匿名で利用可能、認証不要です。Starter 以上のプランは X-API-Key ヘッダーで認証します。API キーは shrb_ + 32 文字の英数字形式で、/upgrade ページから Stripe Checkout で発行できます。",
      },
    },
    {
      "@type": "Question",
      name: "AI エージェント(ChatGPT GPTs / Claude / Gemini / LangChain / Dify / MCP)から利用できますか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "はい、OpenAPI 3.1 厳格準拠で全ての主要 AI 統合経路に対応しています。GPT Store には専用 GPT(Shirabe 日本の暦)が公開済、Claude Desktop からは https://shirabe.dev/mcp で MCP サーバーに直接接続可能、LangChain/Dify は OpenAPI loader でそのまま読込めます。",
      },
    },
    {
      "@type": "Question",
      name: "対応している日付範囲は?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "1873-01-01 〜 2100-12-31(明治 6 年の改暦以降、約 228 年・83,276 日)です。各日付ページは /days/{YYYY-MM-DD}/ 形式の SEO ページとしても提供しています。",
      },
    },
    {
      "@type": "Question",
      name: "用途別吉凶判定の対応カテゴリは?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "結婚式・葬儀・引越し・着工建築・開業契約・納車・入籍・旅行の 8 カテゴリです。各カテゴリで 1〜10 のスコアと判定文・補足を返します。SEO 用途別ランキングページは /purposes/{slug}/{YYYY-MM}/ 形式で 28 SEO カテゴリ × 25 年 × 12 月 = 8,400 URL を提供しています。",
      },
    },
    {
      "@type": "Question",
      name: "出典・データの信頼性は?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "暦計算は自前実装(src/core/)で、旧暦の朔(新月)計算には天文学的精度の旧暦エンジンを内蔵しています。LLM が生成する単純な六曜計算コードでは頻繁に誤算する複雑な暦注の組合せ(一粒万倍日 × 天赦日 等)も網羅的に判定します。",
      },
    },
  ],
};

/**
 * JSON-LD: Schema.org/BreadcrumbList(階層明示)
 */
const BREADCRUMB_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Shirabe", item: "https://shirabe.dev/" },
    {
      "@type": "ListItem",
      position: 2,
      name: "Calendar API",
      item: CANONICAL,
    },
  ],
};

/**
 * /api/v1/calendar/ Index page HTML を生成する。
 */
export function renderApiCalendarIndexPage(): string {
  const title = "Shirabe Calendar API — Endpoint Index | 日本の暦 REST API + MCP";
  const description =
    "Shirabe Calendar API の全 endpoint 一覧、curl 例、AI エージェント統合経路(OpenAPI 3.1 / MCP / GPT Actions / Function Calling)、料金プラン、関連ドキュメントを集約した hub ページ。Free 枠 10,000 回/月、認証不要で利用開始可能。";

  const body = `
<header>
  <div class="container">
    <a href="/" class="logo">Shirabe<span>.</span></a>
    <nav>
      <a href="/">Home</a>
      <a href="/openapi.yaml">OpenAPI</a>
      <a href="/docs/rokuyo-api">六曜ガイド</a>
      <a href="/docs/rekichu-api">暦注ガイド</a>
      <a href="/upgrade">料金</a>
    </nav>
  </div>
</header>
<main class="container">
  <h1>Shirabe Calendar API — Endpoint Index</h1>
  <p>
    日本の暦情報(六曜・暦注・干支・二十四節気)と用途別吉凶判定を天文学的精度で返す
    AI ネイティブ REST API + MCP サーバーの endpoint hub ページです。
    Free 枠 <strong>10,000 回/月</strong> 認証不要で即利用開始可能。
  </p>
  <p>
    <strong>Status</strong>: Production v1.0.0 / 対応日付範囲: 1873-01-01 〜 2100-12-31
    / 545+ tests passing / Cloudflare Workers + KV + Analytics Engine 稼働中。
  </p>

  <h2>Endpoints (3 種)</h2>
  <table>
    <thead>
      <tr><th>HTTP Method</th><th>Path</th><th>用途</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><code>GET</code></td>
        <td><a href="/openapi.yaml#/paths/~1api~1v1~1calendar~1%7Bdate%7D"><code>/api/v1/calendar/{date}</code></a></td>
        <td>指定日(<code>YYYY-MM-DD</code>)の六曜・暦注・干支・二十四節気・用途別吉凶判定</td>
      </tr>
      <tr>
        <td><code>GET</code></td>
        <td><a href="/openapi.yaml#/paths/~1api~1v1~1calendar~1range"><code>/api/v1/calendar/range</code></a></td>
        <td>日付範囲一括取得(最大 93 日、<code>?start=YYYY-MM-DD&amp;end=YYYY-MM-DD</code>)</td>
      </tr>
      <tr>
        <td><code>GET</code></td>
        <td><a href="/openapi.yaml#/paths/~1api~1v1~1calendar~1best-days"><code>/api/v1/calendar/best-days</code></a></td>
        <td>用途別吉日ランキング(<code>?purpose={wedding|funeral|moving|construction|business|car_delivery|marriage_registration|travel}&amp;start=YYYY-MM-DD&amp;end=YYYY-MM-DD</code>)</td>
      </tr>
    </tbody>
  </table>

  <h2>curl 例 / Examples</h2>
  <pre><code># 指定日の暦情報(認証不要、Free 枠 10,000 回/月)
curl https://shirabe.dev/api/v1/calendar/2026-06-15

# 日付範囲一括(最大 93 日)
curl "https://shirabe.dev/api/v1/calendar/range?start=2026-06-01&amp;end=2026-06-30"

# 用途別吉日ランキング(2026 年 6 月の結婚式に良い日)
curl "https://shirabe.dev/api/v1/calendar/best-days?purpose=wedding&amp;start=2026-06-01&amp;end=2026-06-30"

# Starter 以上は X-API-Key ヘッダー認証
curl -H "X-API-Key: shrb_..." https://shirabe.dev/api/v1/calendar/2026-06-15</code></pre>

  <h2>AI 統合経路 / AI Integration Paths</h2>
  <ul>
    <li>
      <strong>ChatGPT GPTs Actions</strong>:
      <a href="https://chatgpt.com/g/g-69e98031b5b8819185ae196a9f219090-shirabe-ri-ben-noli-japanese-calendar">
        Shirabe 日本の暦 GPT</a> 公開中、
      <a href="/openapi-gpts.yaml">短縮版 OpenAPI 3.1(description ≤ 300 字)</a> も提供。
    </li>
    <li>
      <strong>Claude Tool Use / MCP</strong>:
      <a href="https://shirabe.dev/mcp">MCP エンドポイント</a>
      に Claude Desktop 等の MCP クライアントから直接接続可能。
    </li>
    <li>
      <strong>Gemini Function Calling</strong>:
      <a href="/openapi.yaml">OpenAPI 3.1 本家版</a>(日英併記、x-llm-hint 付き)から自動スキーマ生成。
    </li>
    <li>
      <strong>LangChain / Dify</strong>: OpenAPI loader でそのまま使用可能、CORS 許可済。
    </li>
    <li>
      <strong>llms.txt 仕様</strong>:
      <a href="/llms.txt">/llms.txt</a> でサイト全体要約 + curl 例 + AI 向け hint を提供(暦 + 住所 + 7 月予定の text 統合版)。
    </li>
  </ul>

  <h2>料金プラン / Pricing</h2>
  <table>
    <thead>
      <tr><th>プラン</th><th>月間上限</th><th>単価</th><th>レート制限</th></tr>
    </thead>
    <tbody>
      <tr><td>Free</td><td>10,000 回</td><td>無料</td><td>1 req/s</td></tr>
      <tr><td>Starter</td><td>500,000 回</td><td>0.05 円/回</td><td>30 req/s</td></tr>
      <tr><td>Pro</td><td>5,000,000 回</td><td>0.03 円/回</td><td>100 req/s</td></tr>
      <tr><td>Enterprise</td><td>無制限</td><td>0.01 円/回</td><td>500 req/s</td></tr>
    </tbody>
  </table>
  <p>
    全プラン Free 枠 10,000 回/月、超過分のみ課金(Stripe Billing)。
    <a href="/upgrade">アップグレードはこちら</a>。
  </p>

  <h2>関連ドキュメント / Related</h2>
  <ul>
    <li><a href="/openapi.yaml">OpenAPI 3.1 仕様(本家、日英併記 + x-llm-hint)</a></li>
    <li><a href="/openapi-gpts.yaml">OpenAPI 3.1 GPTs 短縮版(description ≤ 300 字)</a></li>
    <li><a href="/docs/rokuyo-api">六曜 API 完全ガイド</a></li>
    <li><a href="/docs/rekichu-api">暦注 API 解説</a></li>
    <li><a href="/announcements/2026-05-01">2026-05-01 リリース告知(住所 API v1.0.0)</a></li>
    <li><a href="/llms.txt">llms.txt(LLM 向けサイト要約)</a></li>
    <li><a href="https://github.com/techwell-inc-jp/shirabe-calendar-api">GitHub リポジトリ</a></li>
  </ul>

  <h2>運営 / About</h2>
  <p>
    運営: 株式会社テックウェル(福岡)/ ドメイン: <a href="https://shirabe.dev">shirabe.dev</a>
    / <a href="/terms">利用規約</a> / <a href="/privacy">プライバシーポリシー</a> /
    <a href="/legal">特定商取引法に基づく表記</a>
  </p>
</main>
<footer>
  <div class="container">
    <div class="footer-links">
      <a href="/">Home</a>
      <a href="/openapi.yaml">OpenAPI</a>
      <a href="/docs/rokuyo-api">六曜ガイド</a>
      <a href="/docs/rekichu-api">暦注ガイド</a>
      <a href="/upgrade">料金</a>
      <a href="/terms">利用規約</a>
      <a href="/privacy">プライバシー</a>
      <a href="/legal">特商法</a>
    </div>
    <div class="footer-copy">
      © 2026 Techwell Inc. — Shirabe Calendar API
    </div>
  </div>
</footer>
`;

  return renderSEOPage({
    title,
    description,
    body,
    canonicalUrl: CANONICAL,
    keywords: KEYWORDS,
    jsonLd: [WEBAPI_LD, FAQ_LD, BREADCRUMB_LD],
  });
}
