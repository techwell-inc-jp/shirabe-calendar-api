/**
 * Hub license 決済完了ページ(#19 Stripe part)
 *
 * GET /licenses/checkout/success?session_id=cs_xxx
 *
 * session_id から Stripe Session を取得し、metadata.licenseKeyHash 経由で
 * KV license-pending(USAGE_LOGS)から license key 平文を取り出して表示する。
 * Stripe Session 取得失敗時(Secret 未設定等)は session_id のみ表示するフォールバック。
 *
 * per-request の checkout-success.ts と同型(license key は一度しか表示しない)。
 */
import { renderPage } from "./layout.js";
import { escapeHtml } from "./checkout-success.js";
import { getLicensePending } from "../licensing/license-checkout.js";

/**
 * Stripe Checkout Session を取得する(fetch で REST API を直接呼ぶ)。
 */
async function retrieveStripeSession(
  sessionId: string,
  stripeSecretKey: string
): Promise<{ metadata?: { licenseKeyHash?: string; sku?: string } } | null> {
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Basic ${btoa(stripeSecretKey + ":")}` } }
    );
    if (!res.ok) return null;
    return (await res.json()) as { metadata?: { licenseKeyHash?: string; sku?: string } };
  } catch {
    return null;
  }
}

/** license key 取得結果。 */
export type LicenseKeyResult = {
  licenseKey: string | null;
  sku: string | null;
};

/**
 * session_id から KV の license-pending を引き、license key 平文を取得する。
 *
 * @param sessionId Stripe Checkout Session ID
 * @param stripeSecretKey Stripe Secret Key(未設定なら null 返却)
 * @param usageLogsKV USAGE_LOGS KVNamespace
 */
export async function resolveLicenseKeyFromSession(
  sessionId: string | undefined,
  stripeSecretKey: string | undefined,
  usageLogsKV: KVNamespace | undefined
): Promise<LicenseKeyResult> {
  const empty: LicenseKeyResult = { licenseKey: null, sku: null };
  if (!sessionId || !stripeSecretKey || !usageLogsKV) return empty;

  const session = await retrieveStripeSession(sessionId, stripeSecretKey);
  const licenseKeyHash = session?.metadata?.licenseKeyHash;
  if (!licenseKeyHash) return empty;

  const pending = await getLicensePending(usageLogsKV, licenseKeyHash);
  if (!pending) return empty;
  return { licenseKey: pending.licenseKey, sku: pending.sku };
}

/**
 * Hub license 決済完了ページの HTML を生成する。
 *
 * @param sessionId Stripe Checkout Session ID(クエリパラメータ)
 * @param keyResult license key 取得結果(resolveLicenseKeyFromSession の戻り値)
 */
export function renderLicenseSuccessPage(
  sessionId: string | undefined,
  keyResult?: LicenseKeyResult
): string {
  const safeId = sessionId ? escapeHtml(sessionId) : "";
  const licenseKey = keyResult?.licenseKey;
  const sku = keyResult?.sku;

  let keyBlock: string;
  if (licenseKey) {
    const safeSku = sku ? escapeHtml(sku) : "";
    keyBlock = `
    <p style="font-size:.875rem;color:#166534;font-weight:600">SKU: ${safeSku}</p>
    <pre><code>${escapeHtml(licenseKey)}</code></pre>`;
  } else {
    keyBlock = `
    <p class="text-muted" style="font-size:.875rem">
      ライセンスキーは決済確認後にこの画面に表示されます。
      表示されない場合は、しばらく待ってからページをリロードしてください。
    </p>
    <pre><code>shrb_lic_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX</code></pre>`;
  }

  const sessionBlock = safeId
    ? `<p class="text-muted" style="font-size:.875rem">Stripe Session ID: <code>${safeId}</code></p>`
    : `<p class="text-muted" style="font-size:.875rem">Stripe Session ID が見つかりません。調達導線から再度お試しください。</p>`;

  const keyPlaceholder = licenseKey ? escapeHtml(licenseKey) : "shrb_lic_your_license_key";

  const body = `
<div class="hero">
  <h1>ご契約ありがとうございます</h1>
  <p class="tagline">Hub License の決済が完了しました</p>
</div>

<section class="section">
  <div class="card" style="border-color:#fbbf24;background:#fffbeb">
    <h3 class="mt-0" style="color:#92400e">&#x26A0; 重要: ライセンスキーは一度しか表示されません</h3>
    <p>
      下に表示されるライセンスキーは、このページを離れると<strong>二度と表示されません</strong>。
      必ず安全な場所（パスワードマネージャ等）に保管してください。
    </p>
    <p class="mb-8">B2B 4 大 identifier(住所・人名・暦・法人番号)を 1 キーで横断利用できます。紛失時は <a href="/keys/reissue">こちらから再発行</a> できます(登録メールの確認が必要)。</p>
  </div>
</section>

<section class="section">
  <h2>あなたのライセンスキー</h2>
  <div class="card">
    ${keyBlock}
    ${sessionBlock}
  </div>
</section>

<section class="section">
  <h2>使い方</h2>
  <p>ライセンスの権利・状態は introspection エンドポイントで確認できます。</p>
  <pre><code>curl "https://shirabe.dev/api/v1/licenses/${keyPlaceholder}"</code></pre>
</section>

<section class="section">
  <h2>次のステップ</h2>
  <ul>
    <li>ライセンスキーを安全な場所に保存する</li>
    <li><a href="https://shirabe.dev/legal">法務・調達文書</a>(稟議用)を確認する</li>
    <li><a href="/">トップページに戻る</a></li>
  </ul>
</section>
`;

  return renderPage(
    "ライセンス契約完了 — Shirabe API",
    body,
    "Shirabe Hub License の決済が完了しました。ライセンスキーを確認してください。"
  );
}
