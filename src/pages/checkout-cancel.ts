/**
 * 決済キャンセルページ
 *
 * GET /checkout/cancel — Stripe Checkout からキャンセルされた際の戻り先
 */
import { renderPage } from "./layout.js";

/**
 * 決済キャンセルページのHTMLを生成する
 */
export function renderCheckoutCancelPage(): string {
  const body = `
<div class="hero">
  <h1>決済がキャンセルされました</h1>
  <p class="tagline">ご契約は完了していません</p>
</div>

<section class="section">
  <div class="card">
    <p>
      Stripe Checkout での決済がキャンセルされました。
      ご契約は完了していないため、課金は発生していません。
    </p>
    <p class="mb-8">
      プランを再度選択する場合は、下のリンクからアップグレードページに戻ってください。
    </p>
    <p>
      <a href="/upgrade">→ 料金プランに戻る</a>
    </p>
  </div>
</section>

<section class="section">
  <h2>ご利用を続けるには</h2>
  <ul>
    <li><a href="/upgrade">料金プランを選び直す</a></li>
    <li>Free プラン（月10,000回まで無料、APIキー不要）でそのまま利用する</li>
    <li><a href="/">トップページに戻る</a></li>
  </ul>
</section>
`;

  return renderPage(
    "決済キャンセル — Shirabe API",
    body,
    "Shirabe API の決済がキャンセルされました。プランを選び直すか、無料プランでご利用いただけます。",
  );
}
