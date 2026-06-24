/**
 * self-serve キー再発行の HTML ページ群
 *
 *  - renderReissueFormPage      : GET /keys/reissue        メール入力フォーム
 *  - renderReissueRequestedPage : POST /reissue(form) 後の汎用「送信しました」
 *  - renderReissueConfirmPage   : GET /keys/reissue/confirm 再発行を確定するボタン
 *  - renderReissueResultPage    : POST /keys/reissue/confirm 後の新キー表示 / エラー
 *
 * anti-enumeration: 「送信しました」は契約有無に関わらず同一文面(顧客の存在を漏らさない)。
 */
import { renderPage } from "./layout.js";
import { escapeHtml } from "./checkout-success.js";

/** POST 先(per-request key の checkout バイパスと同じ /api/v1/calendar/keys 配下)。 */
const REISSUE_POST_PATH = "/api/v1/calendar/keys/reissue";
/** 確定 POST 先。 */
const CONFIRM_POST_PATH = "/keys/reissue/confirm";

/**
 * メール入力フォーム(GET /keys/reissue)。
 * @param errorMessage 直前の入力エラー(任意)
 */
export function renderReissueFormPage(errorMessage?: string): string {
  const errorBlock = errorMessage
    ? `<p style="color:#b91c1c;font-weight:600">${escapeHtml(errorMessage)}</p>`
    : "";
  const body = `
<div class="hero">
  <h1>APIキーの再発行</h1>
  <p class="tagline">キーを紛失した場合の self-serve 再発行</p>
</div>

<section class="section">
  <div class="card">
    <p>ご契約時のメールアドレスを入力してください。有効な契約がある場合、再発行用の確認リンクをそのメールアドレス宛にお送りします。</p>
    ${errorBlock}
    <form method="post" action="${REISSUE_POST_PATH}">
      <p>
        <label for="email">メールアドレス</label><br>
        <input type="email" id="email" name="email" required
          style="width:100%;max-width:420px;padding:.5rem;border:1px solid #d1d5db;border-radius:6px"
          placeholder="you@example.com">
      </p>
      <p>
        <button type="submit"
          style="background:#2563eb;color:#fff;padding:.6rem 1.4rem;border:none;border-radius:6px;font-weight:600;cursor:pointer">
          確認メールを送る
        </button>
      </p>
    </form>
    <p class="text-muted" style="font-size:.875rem">
      確認リンクをクリックして再発行を確定すると、新しい API キーが一度だけ表示され、古いキーは無効になります。
    </p>
  </div>
</section>
`;
  return renderPage(
    "APIキーの再発行 — Shirabe API",
    body,
    "Shirabe API キーを紛失した場合の self-serve 再発行ページ。"
  );
}

/** 再発行リクエスト受付後の汎用ページ(anti-enumeration、契約有無で文面を変えない)。 */
export function renderReissueRequestedPage(): string {
  const body = `
<div class="hero">
  <h1>確認メールをお送りしました</h1>
  <p class="tagline">メールをご確認ください</p>
</div>

<section class="section">
  <div class="card">
    <p>
      入力されたメールアドレスに有効な契約がある場合、再発行用の確認リンクを記載したメールをお送りしました。
      メール内のリンク(有効期限 30 分)を開いて再発行を確定してください。
    </p>
    <p class="text-muted" style="font-size:.875rem">
      数分待ってもメールが届かない場合は、迷惑メールフォルダをご確認のうえ、メールアドレスが正しいか再度お試しください。
    </p>
    <p><a href="/">トップページに戻る</a></p>
  </div>
</section>
`;
  return renderPage(
    "確認メールを送信しました — Shirabe API",
    body,
    "Shirabe API キー再発行の確認メールを送信しました。"
  );
}

/**
 * 再発行を確定するボタンページ(GET /keys/reissue/confirm?token=...)。
 *
 * ★ メールクライアントのリンク先読み(prefetch)でトークンが消費されないよう、
 *   GET では回転せず、明示的な POST(ボタン)で確定する。
 *
 * @param token URL の token(hidden で POST に引き継ぐ)
 */
export function renderReissueConfirmPage(token: string): string {
  const safeToken = escapeHtml(token);
  const body = `
<div class="hero">
  <h1>再発行の確定</h1>
  <p class="tagline">下のボタンで新しい API キーを発行します</p>
</div>

<section class="section">
  <div class="card" style="border-color:#fbbf24;background:#fffbeb">
    <p style="color:#92400e">
      <strong>確定すると古い API キーは即座に無効になります。</strong>
      古いキーを使っている連携がある場合は、表示される新しいキーに差し替えてください。
    </p>
  </div>
  <div class="card">
    <form method="post" action="${CONFIRM_POST_PATH}">
      <input type="hidden" name="token" value="${safeToken}">
      <button type="submit"
        style="background:#dc2626;color:#fff;padding:.6rem 1.4rem;border:none;border-radius:6px;font-weight:600;cursor:pointer">
        再発行を確定する
      </button>
    </form>
  </div>
</section>
`;
  return renderPage(
    "再発行の確定 — Shirabe API",
    body,
    "Shirabe API キー再発行の確定ページ。"
  );
}

/**
 * 再発行結果ページ(POST /keys/reissue/confirm 後)。
 *
 * @param newKey 発行された新キー(null = トークン無効 / 対象喪失)
 */
export function renderReissueResultPage(newKey: string | null): string {
  if (!newKey) {
    const body = `
<div class="hero">
  <h1>再発行できませんでした</h1>
  <p class="tagline">リンクが無効か、期限切れです</p>
</div>

<section class="section">
  <div class="card">
    <p>
      確認リンクが無効、または有効期限(30 分)が切れています。リンクは一度のみ有効です。
      お手数ですが、もう一度最初からお試しください。
    </p>
    <p><a href="/keys/reissue">再発行をやり直す</a></p>
  </div>
</section>
`;
    return renderPage(
      "再発行できませんでした — Shirabe API",
      body,
      "Shirabe API キーの再発行リンクが無効です。"
    );
  }

  const safeKey = escapeHtml(newKey);
  const body = `
<div class="hero">
  <h1>再発行が完了しました</h1>
  <p class="tagline">新しい API キーを発行しました</p>
</div>

<section class="section">
  <div class="card" style="border-color:#fbbf24;background:#fffbeb">
    <h3 class="mt-0" style="color:#92400e">&#x26A0; 重要: APIキーは一度しか表示されません</h3>
    <p>
      下の新しい API キーは、このページを離れると<strong>二度と表示されません</strong>。
      必ず安全な場所(パスワードマネージャ等)に保管してください。古いキーは無効になりました。
    </p>
  </div>
</section>

<section class="section">
  <h2>新しいAPIキー</h2>
  <div class="card">
    <pre><code>${safeKey}</code></pre>
  </div>
</section>

<section class="section">
  <h2>使い方</h2>
  <pre><code>curl -H "X-API-Key: ${safeKey}" \\
  "https://api.shirabe.dev/api/v1/calendar/2026-11-15"</code></pre>
  <p><a href="/">トップページに戻る</a></p>
</section>
`;
  return renderPage(
    "再発行が完了しました — Shirabe API",
    body,
    "Shirabe API キーの再発行が完了しました。"
  );
}
