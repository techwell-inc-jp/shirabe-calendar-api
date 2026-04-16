/**
 * トップページ（ランディングページ）
 *
 * GET / — Shirabe APIプラットフォームの概要・料金・エンドポイント一覧
 */
import { renderPage } from "./layout.js";

/**
 * トップページのHTMLを生成する
 */
export function renderTopPage(): string {
  const body = `
<div class="hero">
  <h1>Shirabe API</h1>
  <p class="tagline">日本のデータを、AIに。</p>
  <p class="desc">
    日本特化のデータAPIプラットフォーム。<br>
    AIエージェントが直接利用できるMCP対応API群を提供します。<br>
    第1弾として暦API（六曜・暦注・吉凶判定）を提供中。今後、住所正規化API等を順次追加予定。
  </p>
</div>

<!-- 提供中のAPI -->
<section class="section">
  <h2>提供中のAPI</h2>
  <div class="card">
    <h3 class="mt-0">Shirabe Calendar API（暦API） <span class="badge badge-green">提供中</span></h3>
    <p>日本の暦情報と用途別吉凶判定を返すAPI。</p>
    <ul>
      <li>六曜（大安・仏滅等）の判定</li>
      <li>暦注13種（一粒万倍日・天赦日・不成就日等）の判定</li>
      <li>干支（十干十二支）の算出</li>
      <li>二十四節気の判定</li>
      <li>用途別吉凶判定（結婚・建築・開業等 8カテゴリ）</li>
    </ul>
  </div>
  <div class="card">
    <h3 class="mt-0">Shirabe Address API（住所正規化API） <span class="badge badge-gray">Coming Soon</span></h3>
    <p>日本の住所を正規化・バリデーションするAPI。詳細は後日公開。</p>
  </div>
</section>

<!-- 共通の特徴 -->
<section class="section">
  <h2>共通の特徴</h2>
  <div class="grid grid-2">
    <div class="card">
      <h3 class="mt-0">MCP対応</h3>
      <p class="mb-8">AIエージェント（Claude、ChatGPT等）が直接呼び出し可能。REST API と MCP サーバーの両方を提供。</p>
    </div>
    <div class="card">
      <h3 class="mt-0">シンプルな料金</h3>
      <p class="mb-8">全プラン月10,000回まで無料。以降は従量課金で¥0.01〜¥0.05/回のわかりやすい料金体系。</p>
    </div>
  </div>
</section>

<!-- エンドポイント -->
<section class="section">
  <h2>APIエンドポイント（Calendar API）</h2>
  <table>
    <thead>
      <tr><th>メソッド</th><th>パス</th><th>説明</th></tr>
    </thead>
    <tbody>
      <tr><td><code>GET</code></td><td><code>/api/v1/calendar/:date</code></td><td>指定日の暦情報</td></tr>
      <tr><td><code>GET</code></td><td><code>/api/v1/calendar/range</code></td><td>日付範囲の暦情報</td></tr>
      <tr><td><code>GET</code></td><td><code>/api/v1/calendar/best-days</code></td><td>用途別ベスト日検索</td></tr>
      <tr><td><code>GET</code></td><td><code>/health</code></td><td>ヘルスチェック（認証不要）</td></tr>
    </tbody>
  </table>

  <h3>リクエスト例</h3>
  <pre><code>curl -H "X-API-Key: shrb_your_api_key" \\
  "https://api.shirabe.dev/api/v1/calendar/2026-11-15"</code></pre>

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
  <h2>料金プラン</h2>
  <p class="text-muted" style="font-size:.875rem">全プラン共通で、最初の10,000回/月は無料。以降は従量課金。</p>
  <table>
    <thead>
      <tr><th>プラン</th><th>月間上限</th><th>単価</th><th>月額例</th><th>レート制限</th></tr>
    </thead>
    <tbody>
      <tr><td><strong>Free</strong></td><td>10,000回</td><td>無料</td><td>¥0</td><td>1 req/s</td></tr>
      <tr><td><strong>Starter</strong></td><td>500,000回</td><td>¥0.05/回（¥50/1,000回）</td><td>50万回: ¥25,000</td><td>30 req/s</td></tr>
      <tr><td><strong>Pro</strong></td><td>5,000,000回</td><td>¥0.03/回（¥30/1,000回）</td><td>500万回: ¥150,000</td><td>100 req/s</td></tr>
      <tr><td><strong>Enterprise</strong></td><td>無制限</td><td>¥0.01/回（¥10/1,000回）</td><td>1,000万回: ¥100,000</td><td>500 req/s</td></tr>
    </tbody>
  </table>
  <p><a href="/upgrade">→ プラン比較とお申し込み</a></p>
</section>

<!-- ドキュメント -->
<section class="section">
  <h2>ドキュメント</h2>
  <p>
    APIリファレンス・MCP設定例・クイックスタートは GitHub で公開しています。<br>
    <a href="https://github.com/techwell-inc-jp/shirabe-calendar-api" target="_blank" rel="noopener">
      github.com/techwell-inc-jp/shirabe-calendar-api
    </a>
  </p>
</section>

<!-- 運営 -->
<section class="section text-muted" style="font-size:.875rem">
  <p>運営: 株式会社テックウェル</p>
</section>
`;

  return renderPage(
    "Shirabe API — 日本のデータを、AIに。",
    body,
    "日本特化のデータAPIプラットフォーム。AIエージェントが直接利用できるMCP対応API群。暦API（六曜・暦注・吉凶判定）提供中。"
  );
}
