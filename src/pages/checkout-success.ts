/**
 * 決済完了ページ
 *
 * GET /checkout/success?session_id=cs_xxx
 *
 * session_id から Stripe Session を取得し、metadata.apiKeyHash 経由で
 * KV checkout-pending からAPIキー平文を取り出して表示する。
 * Stripe Session 取得に失敗した場合（Secret Key 未設定等）は
 * session_id のみ表示するフォールバック。
 */
import { renderPage } from "./layout.js";

/**
 * session_id 文字列をHTMLエスケープする
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Stripe Checkout Session を取得する（fetch で REST API を直接呼ぶ）
 */
async function retrieveStripeSession(
  sessionId: string,
  stripeSecretKey: string
): Promise<{ metadata?: { apiKeyHash?: string; plan?: string } } | null> {
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: {
          Authorization: `Basic ${btoa(stripeSecretKey + ":")}`,
        },
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as { metadata?: { apiKeyHash?: string; plan?: string } };
  } catch {
    return null;
  }
}

/** APIキー取得結果 */
export type KeyResult = {
  apiKey: string | null;
  plan: string | null;
  email: string | null;
};

/**
 * session_id からKVのcheckout-pendingデータを引き、APIキー平文を取得する
 *
 * @param sessionId Stripe Checkout Session ID
 * @param stripeSecretKey Stripe Secret Key（未設定なら null 返却）
 * @param usageLogsKV USAGE_LOGS KVNamespace
 */
export async function resolveApiKeyFromSession(
  sessionId: string | undefined,
  stripeSecretKey: string | undefined,
  usageLogsKV: KVNamespace | undefined
): Promise<KeyResult> {
  const empty: KeyResult = { apiKey: null, plan: null, email: null };
  if (!sessionId || !stripeSecretKey || !usageLogsKV) return empty;

  const session = await retrieveStripeSession(sessionId, stripeSecretKey);
  const apiKeyHash = session?.metadata?.apiKeyHash;
  if (!apiKeyHash) return empty;

  const pendingStr = await usageLogsKV.get(`checkout-pending:${apiKeyHash}`);
  if (!pendingStr) return empty;

  try {
    const pending = JSON.parse(pendingStr) as {
      apiKey: string;
      plan: string;
      email: string;
    };
    return { apiKey: pending.apiKey, plan: pending.plan, email: pending.email };
  } catch {
    return empty;
  }
}

/**
 * 決済完了ページのHTMLを生成する
 * @param sessionId Stripe Checkout Session ID（クエリパラメータ）
 * @param keyResult APIキー取得結果（resolveApiKeyFromSession の戻り値）
 */
export function renderCheckoutSuccessPage(
  sessionId: string | undefined,
  keyResult?: KeyResult
): string {
  const safeId = sessionId ? escapeHtml(sessionId) : "";
  const apiKey = keyResult?.apiKey;
  const plan = keyResult?.plan;

  // APIキーブロック
  let apiKeyBlock: string;
  if (apiKey) {
    const safePlan = plan ? escapeHtml(plan) : "";
    apiKeyBlock = `
    <p style="font-size:.875rem;color:#166534;font-weight:600">プラン: ${safePlan}</p>
    <pre><code>${escapeHtml(apiKey)}</code></pre>`;
  } else {
    apiKeyBlock = `
    <p class="text-muted" style="font-size:.875rem">
      APIキーは決済確認後にこの画面に表示されます。
      表示されない場合は、しばらく待ってからページをリロードしてください。
    </p>
    <pre><code>shrb_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX</code></pre>`;
  }

  const sessionBlock = safeId
    ? `<p class="text-muted" style="font-size:.875rem">Stripe Session ID: <code>${safeId}</code></p>`
    : `<p class="text-muted" style="font-size:.875rem">Stripe Session ID が見つかりません。決済導線から再度お試しください。</p>`;

  // MCP設定例に実際のキーを埋め込む
  const keyPlaceholder = apiKey ? escapeHtml(apiKey) : "shrb_your_api_key";

  const body = `
<div class="hero">
  <h1>ご契約ありがとうございます</h1>
  <p class="tagline">決済が完了しました</p>
</div>

<section class="section">
  <div class="card" style="border-color:#fbbf24;background:#fffbeb">
    <h3 class="mt-0" style="color:#92400e">&#x26A0; 重要: APIキーは一度しか表示されません</h3>
    <p>
      下に表示されるAPIキーは、このページを離れると<strong>二度と表示されません</strong>。
      必ず安全な場所（パスワードマネージャ等）に保管してください。
    </p>
    <p class="mb-8">紛失した場合は再発行が必要です。</p>
  </div>
</section>

<section class="section">
  <h2>あなたのAPIキー</h2>
  <div class="card">
    ${apiKeyBlock}
    ${sessionBlock}
  </div>
</section>

<section class="section">
  <h2>使い方</h2>

  <h3>REST API</h3>
  <pre><code>curl -H "X-API-Key: ${keyPlaceholder}" \\
  "https://api.shirabe.dev/api/v1/calendar/2026-11-15"</code></pre>

  <h3>MCP設定例（Claude Desktop / Claude Code）</h3>
  <pre><code>{
  "mcpServers": {
    "shirabe-calendar": {
      "command": "npx",
      "args": ["-y", "@shirabe-api/calendar-mcp"],
      "env": {
        "SHIRABE_API_KEY": "${keyPlaceholder}"
      }
    }
  }
}</code></pre>
</section>

<section class="section">
  <h2>次のステップ</h2>
  <ul>
    <li>APIキーを安全な場所に保存する</li>
    <li><a href="https://github.com/techwell-inc-jp/shirabe-calendar-api" target="_blank" rel="noopener">GitHub ドキュメント</a>でエンドポイント一覧を確認する</li>
    <li><a href="/">トップページに戻る</a></li>
  </ul>
</section>
`;

  return renderPage(
    "決済完了 — Shirabe API",
    body,
    "Shirabe API の決済が完了しました。APIキーを確認してください。"
  );
}
