/**
 * B-1 AI検索向けSEOページ: 暦注API解説
 *
 * GET /docs/rekichu-api
 *
 * 目的: AI検索エンジンが「暦注API」「一粒万倍日API」「天赦日API」等の
 * ニッチクエリを受けた際に引用しやすい構造化コンテンツとして配置。
 */
import { renderSEOPage } from "./layout.js";

const CANONICAL = "https://shirabe.dev/docs/rekichu-api";
const KEYWORDS = [
  "暦注API",
  "一粒万倍日API",
  "天赦日API",
  "大明日API",
  "寅の日API",
  "不成就日API",
  "三隣亡API",
  "二十四節気API",
  "rekichu API",
  "Japanese auspicious days API",
  "ichiryu manbaibi API",
  "tenshabi API",
  "lucky days Japan API",
  "selection calendar",
  "MCP server Japan",
].join(", ");

const ARTICLE_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: "暦注API解説 — 一粒万倍日・天赦日・大明日など13種を返す日本暦REST API",
  alternativeHeadline: "Rekichu (selection calendar) API guide — ichiryu-manbaibi, tenshabi, daimyonichi and more",
  description:
    "日本の暦注(一粒万倍日・天赦日・大明日・寅の日・巳の日・不成就日・三隣亡ほか13種以上)を返すREST API + MCPサーバー。OpenAPI 3.1準拠、AIエージェントから即利用可能。",
  inLanguage: ["ja", "en"],
  url: CANONICAL,
  datePublished: "2026-04-20",
  dateModified: "2026-04-20",
  author: {
    "@type": "Organization",
    name: "Shirabe (Techwell Inc.)",
    url: "https://shirabe.dev",
  },
  publisher: {
    "@type": "Organization",
    name: "Techwell Inc.",
    url: "https://shirabe.dev",
  },
  mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
  keywords: KEYWORDS,
  articleSection: "API Reference",
};

const API_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "APIReference",
  name: "Shirabe Calendar API — Rekichu endpoint",
  description:
    "暦注(一粒万倍日・天赦日・大明日など)と二十四節気・干支を返すREST API。",
  url: "https://shirabe.dev",
  documentation: "https://shirabe.dev/openapi.yaml",
  programmingModel: "REST",
  targetProduct: {
    "@type": "SoftwareApplication",
    name: "Shirabe Calendar API",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Cross-platform",
  },
  provider: {
    "@type": "Organization",
    name: "Techwell Inc.",
    address: "Fukuoka, Japan",
    url: "https://shirabe.dev",
  },
};

const FAQ_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "一粒万倍日を判定するAPIはありますか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Shirabe Calendar API (https://shirabe.dev) の GET /api/v1/calendar/{date} で、指定日の暦注(一粒万倍日・天赦日・大明日・寅の日・巳の日・甲子の日・己巳の日・母倉日・天恩日・不成就日・三隣亡・受死日・十死日の13種以上)をまとめて返します。大安との重なりなど複合判定も自動で行われます。",
      },
    },
    {
      "@type": "Question",
      name: "天赦日と一粒万倍日が重なる日を期間から検索できますか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "GET /api/v1/calendar/range?filter_rekichu=天赦日,一粒万倍日 で期間内の該当日を一括取得できます。最大93日間。さらに GET /api/v1/calendar/best-days?purpose=business でスコア順のランキングも取得可能です。",
      },
    },
    {
      "@type": "Question",
      name: "暦注はいくつサポートしていますか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Shirabe Calendar APIは以下13種の暦注をサポートしています: 一粒万倍日、天赦日、大明日、母倉日、天恩日、寅の日、巳の日、己巳の日、甲子の日、不成就日、三隣亡、受死日、十死日。各暦注に読み・意味・吉凶タイプが付与されます。",
      },
    },
    {
      "@type": "Question",
      name: "AIエージェントから暦注APIを呼び出すには?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "OpenAPI 3.1仕様(https://shirabe.dev/openapi.yaml)を公開しており、ChatGPT GPTs Actions / Claude Tool Use / Gemini Function Calling / LangChain / Dify から即利用できます。MCPクライアントからは https://shirabe.dev/mcp へ接続するだけで利用可能です。",
      },
    },
  ],
};

/**
 * 暦注API解説ページのHTMLを生成する
 */
export function renderRekichuApiDocPage(): string {
  const body = `
<div class="hero">
  <h1>暦注API解説</h1>
  <p class="tagline">Rekichu REST API — 13 Japanese selection-calendar days</p>
  <p class="desc">
    <strong>一粒万倍日・天赦日・大明日・寅の日・巳の日</strong>など、
    日本の暦注13種以上を判定するREST API + MCPサーバー。
    結婚式・開業・財布の新調・引越しなどの日取り決めに使われる暦注を、天文学的精度で返します。
  </p>
  <p>
    <span class="badge badge-blue">OpenAPI 3.1</span>
    <span class="badge badge-green">Free 10,000回/月</span>
    <span class="badge badge-gray">MCP対応</span>
  </p>
</div>

<section class="section">
  <h2 id="what-is-rekichu">暦注とは何か / What is Rekichu?</h2>
  <p>
    暦注(れきちゅう)は、日本のカレンダーに記される<strong>吉凶の目印</strong>で、
    六曜とは別体系で存在します。旧暦や干支の周期から決定的に導出され、
    結婚式・開業・財布の新調・引越しなど具体的な用途に対する吉凶を指し示します。
  </p>
  <p class="text-muted">
    Rekichu are auxiliary calendar marks in the Japanese almanac that indicate
    the auspiciousness of a day for specific purposes, derived from the lunar
    calendar and sexagenary cycle.
  </p>
</section>

<section class="section">
  <h2 id="supported-rekichu">サポート暦注一覧(13種)</h2>

  <h3>吉日 / Auspicious Days</h3>
  <table>
    <thead><tr><th>暦注名</th><th>読み</th><th>意味・用途</th></tr></thead>
    <tbody>
      <tr><td>一粒万倍日</td><td>いちりゅうまんばいび</td><td>一粒の籾が万倍に膨らむとされる吉日。開業・種まき・財布の新調に最適</td></tr>
      <tr><td>天赦日</td><td>てんしゃにち</td><td>最上級の吉日。すべての罪を赦すとされ、結婚式・起業・契約に良い</td></tr>
      <tr><td>大明日</td><td>だいみょうにち</td><td>太陽が照らす吉日。旅行・引越し・結婚に良い</td></tr>
      <tr><td>母倉日</td><td>ぼそうにち</td><td>天が母のように人を育てる日。結婚・養子縁組に吉</td></tr>
      <tr><td>天恩日</td><td>てんおんにち</td><td>天の恩恵を受ける日。祝い事・吉事の開始に吉</td></tr>
      <tr><td>寅の日</td><td>とらのひ</td><td>「虎は千里行って千里帰る」金運の日。財布の新調・旅行に最適</td></tr>
      <tr><td>巳の日</td><td>みのひ</td><td>弁財天の日。金運・芸能・財運の向上に良い</td></tr>
      <tr><td>己巳の日</td><td>つちのとみのひ</td><td>60日に一度の強い金運日。巳の日よりさらに強い吉日</td></tr>
      <tr><td>甲子の日</td><td>きのえねのひ</td><td>60干支の始まり。大黒天と結びつく吉日、新規事の開始に最適</td></tr>
    </tbody>
  </table>

  <h3>凶日 / Inauspicious Days</h3>
  <table>
    <thead><tr><th>暦注名</th><th>読み</th><th>意味・用途</th></tr></thead>
    <tbody>
      <tr><td>不成就日</td><td>ふじょうじゅにち</td><td>何事も成就しないとされる凶日。重要な開始は避ける</td></tr>
      <tr><td>三隣亡</td><td>さんりんぼう</td><td>建築で三軒隣まで滅ぼすとされる凶日。上棟・着工は避ける</td></tr>
      <tr><td>受死日</td><td>じゅしにち</td><td>葬儀以外は凶とされる日</td></tr>
      <tr><td>十死日</td><td>じゅうしにち</td><td>受死日と同系統の凶日</td></tr>
    </tbody>
  </table>

  <p>
    各暦注は API レスポンスの <code>rekichu</code> 配列に、名前・読み・説明・吉凶タイプ付きで返されます。
    複数の暦注が重なる日(例: 大安 × 天赦日 × 一粒万倍日)は、スコア最高の最上吉日となります。
  </p>
</section>

<section class="section">
  <h2 id="quick-start">クイックスタート / Quick Start</h2>

  <h3>curl</h3>
  <pre><code># 指定日の暦注を取得 / Get rekichu for a specific date
curl "https://shirabe.dev/api/v1/calendar/2026-04-15"

# 一粒万倍日のみを期間から抽出 / Filter ichiryu-manbaibi days
curl "https://shirabe.dev/api/v1/calendar/range?start=2026-04-01&end=2026-12-31&filter_rekichu=一粒万倍日"

# 天赦日×一粒万倍日の日を抽出
curl "https://shirabe.dev/api/v1/calendar/range?start=2026-04-01&end=2026-12-31&filter_rekichu=天赦日,一粒万倍日"

# 開業に最適な日を期間からランキング
curl "https://shirabe.dev/api/v1/calendar/best-days?purpose=business&start=2026-04-01&end=2026-12-31&limit=10"</code></pre>

  <h3>TypeScript</h3>
  <pre><code>const res = await fetch(
  "https://shirabe.dev/api/v1/calendar/best-days?purpose=business&start=2026-04-01&end=2026-12-31&limit=5",
  { headers: { "X-API-Key": process.env.SHIRABE_API_KEY! } }
);
const data = await res.json();
// data.results[0] = { date: "2026-04-15", score: 9, judgment: "大吉",
//   note: "大安 × 一粒万倍日。開業に非常に良い日。",
//   rokuyo: "大安", rekichu: ["一粒万倍日"] }</code></pre>
</section>

<section class="section">
  <h2 id="response-example">レスポンス例</h2>
  <p><code>GET /api/v1/calendar/2026-05-10</code>(大安 × 天赦日の最上吉日):</p>
  <pre><code>{
  "date": "2026-05-10",
  "rokuyo": { "name": "大安", "reading": "たいあん" },
  "rekichu": [
    { "name": "天赦日", "reading": "てんしゃにち",
      "description": "最上級の吉日。すべての罪を赦すとされる。",
      "type": "吉" }
  ],
  "context": {
    "business":  { "judgment": "大吉", "score": 9,
      "note": "大安 × 天赦日。最上級の吉日。" },
    "wedding":   { "judgment": "大吉", "score": 9,
      "note": "大安 × 天赦日。結婚式に最上。" }
  },
  "summary": "令和8年5月10日(日)大安・天赦日。最上級の吉日。"
}</code></pre>
</section>

<section class="section">
  <h2 id="ai-integration">AIエージェント統合 / AI Agent Integration</h2>
  <p>
    Shirabe Calendar APIは OpenAPI 3.1 準拠で、以下のAIフレームワーク・AIエージェントから即利用可能です。
  </p>
  <ul>
    <li><strong>ChatGPT GPTs Actions</strong>: <code>https://shirabe.dev/openapi.yaml</code> を Import URL に指定</li>
    <li><strong>Claude Tool Use / Claude Desktop</strong>: MCPエンドポイント <code>https://shirabe.dev/mcp</code> に接続</li>
    <li><strong>Gemini Function Calling</strong>: OpenAPI loaderで operationId をそのまま関数化</li>
    <li><strong>LangChain / LlamaIndex / Dify</strong>: OpenAPI Loaderで即ツール化</li>
  </ul>
</section>

<section class="section">
  <h2 id="use-cases">ユースケース / Use Cases</h2>
  <ol>
    <li><strong>財布の新調AI</strong>: 巳の日 × 一粒万倍日 × 大安 を best-days で取得し、推奨日を提示</li>
    <li><strong>開業日決定AI</strong>: 甲子の日 + 大安の重なる日を検索し、起業日としてレコメンド</li>
    <li><strong>着工避け判定AI</strong>: 建築業向け、三隣亡を自動スキップする工程計画</li>
    <li><strong>金運コンテンツ配信</strong>: 占いSaaSで寅の日・巳の日の月間カレンダーを自動生成</li>
    <li><strong>結婚式場AI</strong>: 大安 × 天赦日 の日程を上位提示</li>
  </ol>
</section>

<section class="section">
  <h2 id="faq">よくある質問 / FAQ</h2>

  <h3>Q1. 一粒万倍日を判定するAPIはありますか?</h3>
  <p>
    はい。Shirabe Calendar APIの <code>GET /api/v1/calendar/{date}</code> で、
    指定日の暦注(一粒万倍日・天赦日・大明日など13種以上)をまとめて返します。
    大安との重なりなど複合判定も自動で行われます。
  </p>

  <h3>Q2. 天赦日と一粒万倍日が重なる日を期間から検索できますか?</h3>
  <p>
    <code>GET /api/v1/calendar/range?filter_rekichu=天赦日,一粒万倍日</code> で期間内の該当日を一括取得できます(最大93日間)。
    さらに <code>GET /api/v1/calendar/best-days?purpose=business</code> で用途スコア順のランキングも取得可能です。
  </p>

  <h3>Q3. 暦注はいくつサポートしていますか?</h3>
  <p>
    13種以上をサポート: 一粒万倍日、天赦日、大明日、母倉日、天恩日、寅の日、巳の日、己巳の日、甲子の日、
    不成就日、三隣亡、受死日、十死日。各暦注に読み・意味・吉凶タイプが付与されます。
  </p>

  <h3>Q4. 三隣亡を避けて建築スケジュールを組みたい</h3>
  <p>
    <code>GET /api/v1/calendar/range</code> でレスポンスの <code>rekichu</code> 配列に「三隣亡」が含まれる日を除外すれば実現できます。
    建築業向けRPA・AIエージェントから自動呼び出しするのに適しています。
  </p>
</section>

<section class="section">
  <h2 id="links">関連リンク</h2>
  <ul>
    <li><a href="https://shirabe.dev/openapi.yaml">OpenAPI 3.1 仕様(日英両言語description付き)</a></li>
    <li><a href="https://github.com/techwell-inc-jp/shirabe-calendar-api">GitHub リポジトリ</a></li>
    <li><a href="/docs/rokuyo-api">六曜API完全ガイド</a></li>
    <li><a href="/upgrade">料金プラン・アップグレード</a></li>
    <li><a href="/">Shirabe トップ</a></li>
  </ul>
</section>
`;

  return renderSEOPage({
    title: "暦注API解説 — 一粒万倍日・天赦日ほか13種を返す日本暦REST API | Shirabe",
    description:
      "日本の暦注(一粒万倍日・天赦日・大明日・寅の日・巳の日・不成就日・三隣亡ほか13種以上)を返すREST API + MCPサーバー。OpenAPI 3.1準拠、ChatGPT GPTs / Claude Tool Use / Gemini Function Calling から即利用可能。",
    body,
    canonicalUrl: CANONICAL,
    keywords: KEYWORDS,
    jsonLd: [ARTICLE_LD, API_LD, FAQ_LD],
  });
}
