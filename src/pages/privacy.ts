/**
 * プライバシーポリシーページ
 *
 * GET /privacy — Shirabe API プライバシーポリシー
 */
import { renderPage } from "./layout.js";

/**
 * プライバシーポリシーページのHTMLを生成する
 */
export function renderPrivacyPage(): string {
  const body = `
<h1>プライバシーポリシー</h1>
<p class="text-muted">制定日: 2026年4月14日</p>

<p>
  株式会社テックウェル（以下「当社」）は、Shirabe API（shirabe.dev で提供するすべてのAPIサービス、
  以下「本サービス」）における個人情報の取り扱いについて、以下のとおり定めます。
</p>

<h2>1. 収集する情報</h2>
<table>
  <thead>
    <tr><th>情報の種類</th><th>詳細</th></tr>
  </thead>
  <tbody>
    <tr><td>APIキー</td><td>利用者を識別するために発行・保存します</td></tr>
    <tr><td>リクエストログ</td><td>IPアドレス、リクエストURL、タイムスタンプ、レスポンスステータス</td></tr>
    <tr><td>利用量データ</td><td>リクエスト回数、プラン情報</td></tr>
    <tr><td>決済情報</td><td>Stripe経由の決済情報（当社はカード情報を直接保持しません）</td></tr>
  </tbody>
</table>

<h2>2. 利用目的</h2>
<ul>
  <li>サービスの提供・運営</li>
  <li>利用量に基づく課金処理</li>
  <li>不正利用の検知・防止</li>
  <li>サービスの改善・品質向上</li>
</ul>

<h2>3. 第三者提供</h2>
<p>当社は、以下の場合を除き、個人情報を第三者に提供しません。</p>
<table>
  <thead>
    <tr><th>提供先</th><th>目的</th></tr>
  </thead>
  <tbody>
    <tr><td>Stripe, Inc.</td><td>課金処理のため</td></tr>
    <tr><td>Cloudflare, Inc.</td><td>インフラ・CDN提供のため</td></tr>
  </tbody>
</table>
<p>上記のほか、法令に基づく場合を除き、第三者への提供は行いません。</p>

<h2>4. データ保持期間</h2>
<table>
  <thead>
    <tr><th>データ種別</th><th>保持期間</th></tr>
  </thead>
  <tbody>
    <tr><td>リクエストログ</td><td>90日間</td></tr>
    <tr><td>利用量データ</td><td>サービス利用期間中および解約後1年間</td></tr>
    <tr><td>決済関連データ</td><td>法令に基づく保持期間</td></tr>
  </tbody>
</table>

<h2>5. Cookieについて</h2>
<p>
  本サービスはAPIサービスであり、Cookieは使用しません。
</p>

<h2>6. セキュリティ</h2>
<p>
  当社は、個人情報の漏洩、滅失、毀損を防止するために、以下の安全管理措置を講じています。
</p>
<ul>
  <li>APIキーのハッシュ化保存（SHA-256）</li>
  <li>HTTPS通信の強制</li>
  <li>アクセス制御およびレート制限</li>
</ul>

<h2>7. 利用者の権利</h2>
<p>
  利用者は、当社が保有する自己の個人情報について、開示・訂正・削除を請求することができます。
  ご請求は下記お問い合わせ先までご連絡ください。
</p>

<h2>8. お問い合わせ</h2>
<p>
  個人情報の取り扱いに関するお問い合わせは、以下までお願いいたします。<br>
  メールアドレス: <a href="mailto:support@shirabe.dev">support@shirabe.dev</a>
</p>
`;

  return renderPage(
    "プライバシーポリシー — Shirabe API",
    body,
    "Shirabe API（shirabe.dev）のプライバシーポリシー。個人情報の取り扱い、データ保持期間、セキュリティ対策について。"
  );
}
