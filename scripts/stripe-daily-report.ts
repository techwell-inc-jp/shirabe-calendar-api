/**
 * Stripe 日次利用量レポート（GitHub Actions 用スタンドアロンスクリプト）
 *
 * Cloudflare KV (USAGE_LOGS) に保存された日次利用量を Cloudflare REST API 経由で取得し、
 * Stripe Billing Meter Events API に利用量を送信する。
 *
 * 必要な環境変数:
 *   - STRIPE_SECRET_KEY       : Stripe Secret Key (sk_live_* / sk_test_*)
 *   - CLOUDFLARE_API_TOKEN    : KV Read 権限を持つ API Token
 *   - CLOUDFLARE_ACCOUNT_ID   : Cloudflare Account ID
 *
 * 任意の環境変数:
 *   - REPORT_DATE             : 対象日 (YYYY-MM-DD)、未指定時は UTC 前日
 *   - USAGE_KV_NAMESPACE_ID   : USAGE_LOGS の KV namespace ID（既定: wrangler.toml と同一）
 *   - CUSTOMER_MAP_KEY        : 顧客→StripeCustomerID マッピングが格納された KV キー名
 *                                （既定: "stripe:customer-map"、値は JSON 文字列）
 *   - METER_EVENT_NAME        : Stripe メーターのイベント名（既定: "api_requests"）
 *
 * Node.js 20+ の global fetch を使用し src/ からの import は行わないため、
 * CI 環境でのモジュール解決問題（ERR_MODULE_NOT_FOUND）を回避する。
 */

const DEFAULT_USAGE_KV_NAMESPACE_ID = "00229f606a27479cba182f9d9da5b39c";
const DEFAULT_CUSTOMER_MAP_KEY = "stripe:customer-map";
const DEFAULT_METER_EVENT_NAME = "api_requests";

type UsageEntry = { customerId: string; count: number };
// 変更: subscriptionItemId → stripeCustomerId
type CustomerStripeMap = Record<string, { stripeCustomerId: string }>;
type ReportResult = {
  customerId: string;
  count: number;
  success: boolean;
  error?: string;
};

/** 必須環境変数を取得、未設定ならエラーで終了する。*/
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[ERROR] Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

/** UTC で前日の日付 (YYYY-MM-DD) を返す。*/
function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Cloudflare KV REST API から値を取得する。
 * 404 の場合は null を返す。
 */
async function kvGet(
  accountId: string,
  namespaceId: string,
  apiToken: string,
  key: string
): Promise<string | null> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(
    key
  )}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`KV GET failed (${res.status}) for key="${key}": ${body}`);
  }
  return await res.text();
}

/** 指定日の利用量を KV から集計する。*/
async function collectDailyUsage(
  accountId: string,
  namespaceId: string,
  apiToken: string,
  date: string
): Promise<UsageEntry[]> {
  const indexStr = await kvGet(
    accountId,
    namespaceId,
    apiToken,
    `usage-index:${date}`
  );
  if (!indexStr) return [];

  const customerIds = indexStr.split(",").filter(Boolean);
  const entries: UsageEntry[] = [];
  for (const customerId of customerIds) {
    const countStr = await kvGet(
      accountId,
      namespaceId,
      apiToken,
      `usage:${customerId}:${date}`
    );
    const count = countStr ? parseInt(countStr, 10) : 0;
    if (count > 0) entries.push({ customerId, count });
  }
  return entries;
}

/**
 * Stripe Billing Meter Events API に利用量を送信する。
 * 旧 Usage Records API から新 Meter Events API に変更。
 */
async function reportToStripe(
  stripeSecretKey: string,
  stripeCustomerId: string,
  eventName: string,
  quantity: number,
  timestamp: number
): Promise<{ success: boolean; error?: string }> {
  const url = "https://api.stripe.com/v1/billing/meter_events";
  const body = new URLSearchParams({
    event_name: eventName,
    "payload[value]": String(quantity),
    "payload[stripe_customer_id]": stripeCustomerId,
    timestamp: String(timestamp),
  });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const errBody = await res.text();
    return {
      success: false,
      error: `Stripe API error ${res.status}: ${errBody}`,
    };
  }
  return { success: true };
}

async function main(): Promise<void> {
  const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
  const cfApiToken = requireEnv("CLOUDFLARE_API_TOKEN");
  const cfAccountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");

  const usageNamespaceId =
    process.env.USAGE_KV_NAMESPACE_ID ?? DEFAULT_USAGE_KV_NAMESPACE_ID;
  const customerMapKey =
    process.env.CUSTOMER_MAP_KEY ?? DEFAULT_CUSTOMER_MAP_KEY;
  const meterEventName =
    process.env.METER_EVENT_NAME ?? DEFAULT_METER_EVENT_NAME;
  const date = process.env.REPORT_DATE ?? yesterdayUTC();

  console.log(`[INFO] Stripe daily report for ${date}`);
  console.log(`[INFO] Usage KV namespace: ${usageNamespaceId}`);
  console.log(`[INFO] Meter event name: ${meterEventName}`);

  // 顧客 → StripeCustomerID マッピングを KV から取得
  const mapStr = await kvGet(
    cfAccountId,
    usageNamespaceId,
    cfApiToken,
    customerMapKey
  );
  if (!mapStr) {
    console.log(
      `[WARN] No customer map at KV key "${customerMapKey}". Nothing to report.`
    );
    return;
  }
  let customerMap: CustomerStripeMap;
  try {
    customerMap = JSON.parse(mapStr) as CustomerStripeMap;
  } catch (e) {
    console.error(
      `[ERROR] Failed to parse customer map JSON from KV: ${
        (e as Error).message
      }`
    );
    process.exit(1);
    return; // unreachable: satisfy TS control flow analysis
  }

  const entries = await collectDailyUsage(
    cfAccountId,
    usageNamespaceId,
    cfApiToken,
    date
  );
  console.log(`[INFO] Found usage for ${entries.length} customer(s)`);

  if (entries.length === 0) return;

  const timestamp = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
  const results: ReportResult[] = [];

  for (const entry of entries) {
    const mapping = customerMap[entry.customerId];
    if (!mapping) {
      results.push({
        customerId: entry.customerId,
        count: entry.count,
        success: false,
        error: `No Stripe customer mapping for: ${entry.customerId}`,
      });
      continue;
    }
    const r = await reportToStripe(
      stripeSecretKey,
      mapping.stripeCustomerId,
      meterEventName,
      entry.count,
      timestamp
    );
    results.push({
      customerId: entry.customerId,
      count: entry.count,
      ...r,
    });
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success);

  console.log(`[INFO] Reported ${succeeded}/${results.length} successfully`);
  for (const f of failed) {
    console.error(
      `[ERROR] customer=${f.customerId} count=${f.count} error=${f.error}`
    );
  }

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[FATAL] ${(err as Error).stack ?? String(err)}`);
  process.exit(1);
});
