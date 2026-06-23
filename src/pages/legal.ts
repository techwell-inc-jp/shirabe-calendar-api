/**
 * 特定商取引法に基づく表記ページ
 *
 * GET /legal — 特定商取引法に基づく表記
 */
import { renderPage } from "./layout.js";

/**
 * 特定商取引法に基づく表記ページのHTMLを生成する
 */
export function renderLegalPage(): string {
  const body = `
<h1>特定商取引法に基づく表記</h1>

<table>
  <tbody>
    <tr><th>販売業者</th><td>株式会社テックウェル</td></tr>
    <tr><th>代表者</th><td>吉川 美知代</td></tr>
    <tr><th>所在地</th><td>〒810-0001 福岡市中央区天神1-9-17 福岡天神フコク生命ビル15F</td></tr>
    <tr><th>電話番号</th><td>092-717-3806</td></tr>
    <tr><th>メールアドレス</th><td><a href="mailto:support@shirabe.dev">support@shirabe.dev</a></td></tr>
    <tr><th>URL</th><td><a href="https://shirabe.dev">https://shirabe.dev</a></td></tr>
    <tr><th>サービス名</th><td>Shirabe API（shirabe.dev で提供するすべてのAPIサービス）</td></tr>
  </tbody>
</table>

<h2>販売価格</h2>
<p>料金は API ごとに異なります。各 API とも無料枠を超えた分のみ従量課金（Starter / Pro / Enterprise のプラン別単価）です。</p>
<table>
  <thead>
    <tr><th>API</th><th>無料枠</th><th>超過分の単価（Starter / Pro / Enterprise）</th></tr>
  </thead>
  <tbody>
    <tr><td>暦 API（Calendar）</td><td>10,000 回/月</td><td>¥0.05 / ¥0.03 / ¥0.01（1 回あたり）</td></tr>
    <tr><td>住所正規化 API（Address）</td><td>5,000 回/月</td><td>¥0.5 / ¥0.3 / ¥0.1（1 回あたり）</td></tr>
    <tr><td>テキスト処理 API（Text）</td><td>10,000 回/月</td><td>¥0.05 / ¥0.03 / ¥0.01（1 回あたり）</td></tr>
  </tbody>
</table>
<p class="text-muted" style="font-size:.875rem">
  ※ 価格は税抜表示です。別途消費税を申し受けます。各 API の詳細な料金プラン・上限は
  <a href="/upgrade">暦 API 料金</a> / <a href="/docs/address-pricing">住所 API 料金</a> /
  <a href="/docs/text-pricing">テキスト API 料金</a> をご覧ください。
  法人番号 API も提供しています(データ出典: 国税庁法人番号公表サイト)。
</p>

<h2>支払方法</h2>
<p>クレジットカード（Stripe経由）</p>

<h2>支払時期</h2>
<p>月末締め翌月初請求</p>

<h2>サービス提供時期</h2>
<p>APIキー発行後、即時利用可能</p>

<h2>返品・キャンセル</h2>
<p>
  デジタルサービスの性質上、提供後の返金は原則不可とします。
  ただし、当社の責に帰すべき事由による場合はこの限りではありません。
</p>

<h2>動作環境</h2>
<p>
  インターネット接続環境およびHTTPSリクエストが可能なクライアント
  （ブラウザ、プログラム、AIエージェント等）が必要です。
</p>
`;

  return renderPage(
    "特定商取引法に基づく表記 — Shirabe API",
    body,
    "Shirabe API（shirabe.dev）の特定商取引法に基づく表記。販売業者情報、販売価格、支払方法等。"
  );
}
