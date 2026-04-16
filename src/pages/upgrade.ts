/**
 * アップグレードページ
 *
 * GET /upgrade — 料金プラン比較 + メール入力 + Checkout導線
 *
 * フォーム送信時は `/api/v1/checkout` に `{ email, plan }` を POST する。
 * Checkout URL を取得したら window.location で遷移する。
 */
import { renderPage } from "./layout.js";

/**
 * アップグレードページのHTMLを生成する
 */
export function renderUpgradePage(): string {
  const body = `
<div class="hero">
  <h1>プランを選ぶ</h1>
  <p class="tagline">AIエージェント運用に最適化した従量課金</p>
  <p class="desc">
    全プラン共通で、最初の <strong>10,000回/月は無料</strong>。<br>
    超過分のみ従量課金。月額の固定費ゼロで、使った分だけお支払いいただけます。
  </p>
</div>

<!-- 料金比較表 -->
<section class="section">
  <h2>料金プラン比較</h2>
  <table>
    <thead>
      <tr>
        <th>プラン</th>
        <th>月間上限</th>
        <th>単価</th>
        <th>月額例</th>
        <th>レート制限</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Free</strong></td>
        <td>10,000回</td>
        <td>無料</td>
        <td>¥0</td>
        <td>1 req/s</td>
      </tr>
      <tr>
        <td><strong>Starter</strong></td>
        <td>500,000回</td>
        <td>¥0.05/回（¥50/1,000回）</td>
        <td>10万回: ¥5,000<br>50万回: ¥25,000</td>
        <td>30 req/s</td>
      </tr>
      <tr>
        <td><strong>Pro</strong></td>
        <td>5,000,000回</td>
        <td>¥0.03/回（¥30/1,000回）</td>
        <td>100万回: ¥30,000<br>500万回: ¥150,000</td>
        <td>100 req/s</td>
      </tr>
      <tr>
        <td><strong>Enterprise</strong></td>
        <td>無制限</td>
        <td>¥0.01/回（¥10/1,000回）</td>
        <td>1,000万回: ¥100,000</td>
        <td>500 req/s</td>
      </tr>
    </tbody>
  </table>
  <p class="text-muted" style="font-size:.875rem">
    ※ 全有料プラン共通で、最初の10,000回/月は無料（Free枠）。10,001回目から段階課金。<br>
    ※ 課金単位は1,000回ごと（Stripe側で端数切り上げ）。
  </p>
</section>

<!-- 申込フォーム -->
<section class="section">
  <h2>お申し込み</h2>
  <div class="card">
    <p>メールアドレスとプランを選択してください。Stripe Checkout に遷移します。</p>
    <form id="checkout-form" style="display:flex;flex-direction:column;gap:16px;margin-top:16px">
      <label style="display:flex;flex-direction:column;gap:4px">
        <span style="font-weight:600;font-size:.875rem">メールアドレス</span>
        <input type="email" name="email" required placeholder="you@example.com"
          style="padding:10px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:1rem">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px">
        <span style="font-weight:600;font-size:.875rem">プラン</span>
        <select name="plan" required
          style="padding:10px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:1rem;background:#fff">
          <option value="starter">Starter — ¥0.05/回（10,000回まで無料）</option>
          <option value="pro">Pro — ¥0.03/回（10,000回まで無料）</option>
          <option value="enterprise">Enterprise — ¥0.01/回（10,000回まで無料）</option>
        </select>
      </label>
      <button type="submit"
        style="padding:12px 24px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:1rem;font-weight:600;cursor:pointer">
        Stripe Checkout に進む
      </button>
      <p id="checkout-error" style="color:#b91c1c;font-size:.875rem;display:none"></p>
    </form>
  </div>
  <p class="text-muted" style="font-size:.875rem">
    APIキーは決済完了後に表示されます。キーは一度しか表示されないため、必ず安全な場所に保管してください。
  </p>
</section>

<script>
(function(){
  var form = document.getElementById('checkout-form');
  var errEl = document.getElementById('checkout-error');
  if (!form) return;
  form.addEventListener('submit', function(e){
    e.preventDefault();
    errEl.style.display = 'none';
    var fd = new FormData(form);
    var payload = { email: fd.get('email'), plan: fd.get('plan') };
    fetch('/api/v1/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r){ return r.json().then(function(b){ return { ok: r.ok, body: b }; }); })
      .then(function(res){
        if (res.ok && res.body && res.body.checkout_url) {
          window.location.href = res.body.checkout_url;
        } else {
          var msg = (res.body && res.body.error && res.body.error.message) || 'Checkoutの作成に失敗しました。';
          errEl.textContent = msg;
          errEl.style.display = 'block';
        }
      })
      .catch(function(){
        errEl.textContent = 'ネットワークエラーが発生しました。';
        errEl.style.display = 'block';
      });
  });
})();
</script>
`;

  return renderPage(
    "料金プラン — Shirabe API",
    body,
    "Shirabe API の料金プラン一覧。Free（無料10,000回/月）、Starter、Pro、Enterpriseから選択可能。"
  );
}
