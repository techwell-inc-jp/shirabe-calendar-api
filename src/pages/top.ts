/**
 * トップページ（ランディングページ）
 *
 * GET / — Shirabe API プラットフォームの概要・料金・エンドポイント一覧
 *
 * T-03(B-1 加速スプリント): `@type: WebAPI` + `@type: WebSite` + `@type: Organization`
 * の JSON-LD を埋め込み、AI クローラーと検索エンジンに API サービス実体を構造化提供する。
 */
import { renderSEOPage } from "./layout.js";

const CANONICAL = "https://shirabe.dev/";
const KEYWORDS = [
  "Shirabe",
  "日本特化 API",
  "日本特化 AI ネイティブ API",
  "Japanese data API for AI",
  "AI-native API platform Japan",
  "暦API",
  "日本住所正規化API",
  "Japanese calendar API",
  "Japanese address normalization API",
  "MCP server Japan",
  "OpenAPI 3.1",
  "GPT Actions Japan",
  "Function Calling Japan",
  "AI エージェント 日本データ",
].join(", ");

/**
 * JSON-LD: Organization(shirabe.dev / Techwell Inc.)
 */
const ORGANIZATION_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://shirabe.dev/#organization",
  name: "Shirabe",
  alternateName: "株式会社テックウェル",
  url: "https://shirabe.dev",
  logo: "https://shirabe.dev/favicon.ico",
  address: {
    "@type": "PostalAddress",
    addressCountry: "JP",
    addressRegion: "Fukuoka",
    addressLocality: "Fukuoka-shi",
  },
  sameAs: [
    "https://www.techwell.jp/",
    "https://github.com/techwell-inc-jp",
    "https://qiita.com/yosikawa-techwell",
  ],
};

/**
 * JSON-LD: WebSite(shirabe.dev サイト全体)
 */
const WEBSITE_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://shirabe.dev/#website",
  url: "https://shirabe.dev",
  name: "Shirabe — Japan-specific AI-Native API Platform",
  description:
    "日本特化 AI ネイティブ API プラットフォーム。暦 API・住所正規化 API を OpenAPI 3.1 / MCP / GPT Actions で提供。",
  inLanguage: ["ja", "en"],
  publisher: { "@id": "https://shirabe.dev/#organization" },
};

/**
 * JSON-LD: WebAPI(Shirabe Calendar API、shirabe.dev の第 1 弾 API)
 */
const CALENDAR_WEBAPI_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "WebAPI",
  "@id": "https://shirabe.dev/#calendar-webapi",
  name: "Shirabe Calendar API",
  alternateName: "日本暦 API(六曜・暦注・吉凶判定)",
  description:
    "日本の六曜(大安・友引・先勝・先負・仏滅・赤口)・暦注(一粒万倍日・天赦日ほか 13 種)・干支・二十四節気・用途別吉凶判定を返す REST API + MCP サーバー。OpenAPI 3.1 準拠。",
  url: "https://shirabe.dev/api/v1/calendar",
  documentation: "https://shirabe.dev/openapi.yaml",
  termsOfService: "https://shirabe.dev/terms",
  inLanguage: ["ja", "en"],
  datePublished: "2026-04-01",
  dateModified: "2026-04-23",
  provider: { "@id": "https://shirabe.dev/#organization" },
  isAccessibleForFree: true,
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "JPY",
    lowPrice: "0",
    highPrice: "0.05",
    offerCount: 4,
  },
  potentialAction: {
    "@type": "Action",
    name: "Call Shirabe Calendar API",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://shirabe.dev/api/v1/calendar/{date}",
      contentType: "application/json",
      httpMethod: "GET",
    },
  },
};

/**
 * JSON-LD: WebAPI(Shirabe Address API、5/1 正式リリース予定)
 */
const ADDRESS_WEBAPI_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "WebAPI",
  "@id": "https://shirabe.dev/#address-webapi",
  name: "Shirabe Address API",
  alternateName: "日本住所正規化 API(abr-geocoder / ABR 準拠)",
  description:
    "任意の日本住所を abr-geocoder(デジタル庁 ABR、CC BY 4.0)で正規化し、都道府県/市区町村/町字/街区/住居番号・緯度経度・信頼度・出典表記(attribution)を返す REST API。OpenAPI 3.1 準拠、全 47 都道府県対応。",
  url: "https://shirabe.dev/api/v1/address",
  documentation: "https://shirabe.dev/api/v1/address/openapi.yaml",
  termsOfService: "https://shirabe.dev/terms",
  inLanguage: ["ja", "en"],
  datePublished: "2026-05-01",
  dateModified: "2026-04-23",
  provider: { "@id": "https://shirabe.dev/#organization" },
  isAccessibleForFree: true,
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "JPY",
    lowPrice: "0",
    highPrice: "0.5",
    offerCount: 4,
  },
  potentialAction: {
    "@type": "Action",
    name: "Call Shirabe Address API",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://shirabe.dev/api/v1/address/normalize",
      contentType: "application/json",
      httpMethod: "POST",
    },
  },
};

/**
 * トップページの HTML を生成する
 */
export function renderTopPage(): string {
  const body = `
<div class="hero">
  <h1>Shirabe API</h1>
  <p class="tagline">日本のデータを、AIに。</p>
  <p class="desc">
    日本特化のデータAPIプラットフォーム。<br>
    AIエージェントが直接利用できるMCP対応API群を提供します。<br>
    第1弾として暦API(六曜・暦注・吉凶判定)を提供中。5/1 に住所正規化APIを追加予定。
  </p>
</div>

<!-- 提供中のAPI -->
<section class="section">
  <h2>提供中のAPI</h2>
  <div class="card">
    <h3 class="mt-0">Shirabe Calendar API(暦API) <span class="badge badge-green">提供中</span></h3>
    <p>日本の暦情報と用途別吉凶判定を返すAPI。</p>
    <ul>
      <li>六曜(大安・仏滅等)の判定</li>
      <li>暦注13種(一粒万倍日・天赦日・不成就日等)の判定</li>
      <li>干支(十干十二支)の算出</li>
      <li>二十四節気の判定</li>
      <li>用途別吉凶判定(結婚・建築・開業等 8カテゴリ)</li>
    </ul>
    <p>
      <a href="/docs/rokuyo-api">→ 六曜API 完全ガイド</a> /
      <a href="/docs/rekichu-api">→ 暦注API 解説</a>
    </p>
  </div>
  <div class="card">
    <h3 class="mt-0">Shirabe Address API(住所正規化API) <span class="badge badge-blue">2026-05-01 正式リリース</span></h3>
    <p>
      任意の日本住所を abr-geocoder(デジタル庁 ABR、CC BY 4.0)で正規化し、
      都道府県/市区町村/町字/街区/住居番号・緯度経度・信頼度・出典表記を返す REST API。
    </p>
    <p>
      <a href="/docs/address-normalize">→ 住所正規化API 完全ガイド</a> /
      <a href="/docs/address-batch">→ バッチ正規化ガイド</a> /
      <a href="/docs/address-pricing">→ 料金プラン</a>
    </p>
  </div>
</section>

<!-- 共通の特徴 -->
<section class="section">
  <h2>共通の特徴</h2>
  <div class="grid grid-2">
    <div class="card">
      <h3 class="mt-0">MCP対応</h3>
      <p class="mb-8">AIエージェント(Claude、ChatGPT等)が直接呼び出し可能。REST API と MCP サーバーの両方を提供。</p>
    </div>
    <div class="card">
      <h3 class="mt-0">シンプルな料金</h3>
      <p class="mb-8">暦APIは月10,000回、住所APIは月5,000回まで無料。以降は従量課金。</p>
    </div>
  </div>
</section>

<!-- エンドポイント -->
<section class="section">
  <h2>APIエンドポイント(Calendar API)</h2>
  <table>
    <thead>
      <tr><th>メソッド</th><th>パス</th><th>説明</th></tr>
    </thead>
    <tbody>
      <tr><td><code>GET</code></td><td><code>/api/v1/calendar/:date</code></td><td>指定日の暦情報</td></tr>
      <tr><td><code>GET</code></td><td><code>/api/v1/calendar/range</code></td><td>日付範囲の暦情報</td></tr>
      <tr><td><code>GET</code></td><td><code>/api/v1/calendar/best-days</code></td><td>用途別ベスト日検索</td></tr>
      <tr><td><code>GET</code></td><td><code>/health</code></td><td>ヘルスチェック(認証不要)</td></tr>
    </tbody>
  </table>

  <h3>リクエスト例</h3>
  <pre><code>curl "https://shirabe.dev/api/v1/calendar/2026-11-15"</code></pre>

  <h3>レスポンス例</h3>
  <pre><code>{
  "date": "2026-11-15",
  "wareki": "令和8年11月15日",
  "rokuyo": {
    "name": "大安",
    "reading": "たいあん",
    "description": "終日吉。万事に良い日"
  },
  "rekichu": [
    { "name": "一粒万倍日", "type": "吉" }
  ],
  "context": {
    "結婚": { "judgment": "大吉", "score": 10 }
  },
  "summary": "大安と一粒万倍日が重なる大変縁起の良い日です。"
}</code></pre>
</section>

<!-- 料金プラン -->
<section class="section">
  <h2>料金プラン(Calendar API)</h2>
  <p class="text-muted" style="font-size:.875rem">全プラン共通で、最初の10,000回/月は無料。以降は従量課金。</p>
  <table>
    <thead>
      <tr><th>プラン</th><th>月間上限</th><th>単価</th><th>月額例</th><th>レート制限</th></tr>
    </thead>
    <tbody>
      <tr><td><strong>Free</strong></td><td>10,000回</td><td>無料</td><td>¥0</td><td>1 req/s</td></tr>
      <tr><td><strong>Starter</strong></td><td>500,000回</td><td>¥0.05/回(¥50/1,000回)</td><td>50万回: ¥25,000</td><td>30 req/s</td></tr>
      <tr><td><strong>Pro</strong></td><td>5,000,000回</td><td>¥0.03/回(¥30/1,000回)</td><td>500万回: ¥150,000</td><td>100 req/s</td></tr>
      <tr><td><strong>Enterprise</strong></td><td>無制限</td><td>¥0.01/回(¥10/1,000回)</td><td>1,000万回: ¥100,000</td><td>500 req/s</td></tr>
    </tbody>
  </table>
  <p><a href="/upgrade">→ プラン比較とお申し込み</a></p>
</section>

<!-- ドキュメント -->
<section class="section">
  <h2>ドキュメント</h2>
  <ul>
    <li><a href="https://shirabe.dev/openapi.yaml">OpenAPI 3.1 仕様(Calendar API、日英両言語)</a></li>
    <li><a href="https://shirabe.dev/api/v1/address/openapi.yaml">OpenAPI 3.1 仕様(Address API)</a></li>
    <li><a href="https://shirabe.dev/llms.txt">llms.txt(AI 向けサイト要約)</a></li>
    <li><a href="https://shirabe.dev/mcp">MCP エンドポイント</a></li>
    <li><a href="https://github.com/techwell-inc-jp/shirabe-calendar-api" target="_blank" rel="noopener">GitHub: shirabe-calendar-api</a></li>
    <li><a href="https://github.com/techwell-inc-jp/shirabe-address-api" target="_blank" rel="noopener">GitHub: shirabe-address-api</a></li>
  </ul>
</section>

<!-- 運営 -->
<section class="section text-muted" style="font-size:.875rem">
  <p>運営: 株式会社テックウェル(福岡)</p>
</section>
`;

  return renderSEOPage({
    title: "Shirabe API — 日本特化 AI ネイティブ API プラットフォーム",
    description:
      "日本特化のデータAPIプラットフォーム。AIエージェントが直接利用できるMCP対応API群。暦API(六曜・暦注・吉凶判定)提供中、住所正規化API 5/1 正式リリース。",
    body,
    canonicalUrl: CANONICAL,
    keywords: KEYWORDS,
    jsonLd: [ORGANIZATION_LD, WEBSITE_LD, CALENDAR_WEBAPI_LD, ADDRESS_WEBAPI_LD],
  });
}
