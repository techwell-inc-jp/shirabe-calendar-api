/**
 * APIキー生成スクリプト
 *
 * shrb_ + 32文字のランダム文字列を生成し、SHA-256ハッシュをKVに保存する。
 *
 * 使い方:
 *   npx tsx scripts/generate-api-key.ts --plan <plan> [--customer-id <id>]
 *
 * 環境変数:
 *   CLOUDFLARE_API_TOKEN  — Cloudflare APIトークン
 *   CLOUDFLARE_ACCOUNT_ID — CloudflareアカウントID
 *   KV_NAMESPACE_ID       — API_KEYS KVネームスペースID
 */

const PLAN_TYPES = ["free", "starter", "pro", "enterprise"] as const;
type Plan = (typeof PLAN_TYPES)[number];

/**
 * ランダムなAPIキーを生成する
 * @returns shrb_ + 32文字の16進数文字列
 */
function generateApiKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `shrb_${hex}`;
}

/**
 * 文字列のSHA-256ハッシュを計算する
 */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Cloudflare KVにキー/値を書き込む
 */
async function writeToKV(
  accountId: string,
  namespaceId: string,
  apiToken: string,
  key: string,
  value: string
): Promise<void> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "text/plain",
    },
    body: value,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`KV write failed (${res.status}): ${body}`);
  }
}

/**
 * コマンドライン引数をパースする
 */
function parseArgs(): { plan: Plan; customerId: string } {
  const args = process.argv.slice(2);
  let plan: Plan = "free";
  let customerId = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--plan" && args[i + 1]) {
      const value = args[i + 1] as Plan;
      if (!PLAN_TYPES.includes(value)) {
        console.error(`Invalid plan: ${value}. Must be one of: ${PLAN_TYPES.join(", ")}`);
        process.exit(1);
      }
      plan = value;
      i++;
    } else if (args[i] === "--customer-id" && args[i + 1]) {
      customerId = args[i + 1];
      i++;
    }
  }

  return { plan, customerId };
}

async function main(): Promise<void> {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const namespaceId = process.env.KV_NAMESPACE_ID;

  if (!apiToken || !accountId || !namespaceId) {
    console.error("Required environment variables:");
    console.error("  CLOUDFLARE_API_TOKEN");
    console.error("  CLOUDFLARE_ACCOUNT_ID");
    console.error("  KV_NAMESPACE_ID");
    process.exit(1);
  }

  const { plan, customerId } = parseArgs();
  const apiKey = generateApiKey();
  const hash = await sha256(apiKey);

  const kvValue = JSON.stringify({
    plan,
    customerId: customerId || null,
    createdAt: new Date().toISOString(),
  });

  await writeToKV(accountId, namespaceId, apiToken, hash, kvValue);

  console.log("API key generated successfully!");
  console.log("");
  console.log(`  API Key:     ${apiKey}`);
  console.log(`  SHA-256:     ${hash}`);
  console.log(`  Plan:        ${plan}`);
  console.log(`  Customer ID: ${customerId || "(none)"}`);
  console.log("");
  console.log("IMPORTANT: Save the API key now. It cannot be retrieved later.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
