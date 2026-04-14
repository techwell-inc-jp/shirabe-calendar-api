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
<table>
  <thead>
    <tr><th>プラン</th><th>内容</th><th>単価</th></tr>
  </thead>
  <tbody>
    <tr><td>Free</td><td>月1,000リクエストまで</td><td>無料</td></tr>
    <tr><td>Starter</td><td>月50,000リクエストまで</td><td>1リクエストあたり1円（月1,000リクエストまで無料）</td></tr>
    <tr><td>Pro</td><td>月500,000リクエストまで</td><td>1リクエストあたり1円（月1,000リクエストまで無料）</td></tr>
    <tr><td>Enterprise</td><td>無制限</td><td>1リクエストあたり1円（月1,000リクエストまで無料）</td></tr>
  </tbody>
</table>
<p class="text-muted" style="font-size:.875rem">
  ※ 上記価格は消費税込みです。APIの種類により料金プランが異なる場合があります。
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
