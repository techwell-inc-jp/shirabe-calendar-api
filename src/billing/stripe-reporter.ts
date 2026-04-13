/**
 * Stripe利用量報告
 *
 * KVから日次の利用量データを集計し、Stripe Usage Records APIで報告する。
 * GitHub Actionsの日次バッチから呼ばれる想定。
 *
 * Stripe Usage Records API:
 * POST /v1/subscription_items/{id}/usage_records
 */

/** KVから取得する利用量データ */
export type UsageEntry = {
  customerId: string;
  count: number;
};

/** Stripe報告結果 */
export type ReportResult = {
  customerId: string;
  count: number;
  success: boolean;
  error?: string;
};

/** 顧客→SubscriptionItemのマッピング */
export type CustomerSubscriptionMap = Record<
  string,
  { subscriptionItemId: string }
>;

/**
 * 指定日の利用量をKVから集計する
 * @param usageKV USAGE_LOGS KVバインディング
 * @param date 対象日付（YYYY-MM-DD）
 * @returns 顧客ごとの利用量
 */
export async function collectDailyUsage(
  usageKV: KVNamespace,
  date: string
): Promise<UsageEntry[]> {
  // 日付インデックスから当日利用した顧客IDを取得
  const indexKey = `usage-index:${date}`;
  const indexStr = await usageKV.get(indexKey);

  if (!indexStr) {
    return [];
  }

  const customerIds = indexStr.split(",").filter(Boolean);
  const entries: UsageEntry[] = [];

  for (const customerId of customerIds) {
    const usageKey = `usage:${customerId}:${date}`;
    const countStr = await usageKV.get(usageKey);
    const count = countStr ? parseInt(countStr, 10) : 0;

    if (count > 0) {
      entries.push({ customerId, count });
    }
  }

  return entries;
}

/**
 * Stripe Usage Records APIに利用量を報告する
 * @param stripeSecretKey Stripe Secret Key
 * @param subscriptionItemId Stripe Subscription Item ID
 * @param quantity 利用量
 * @param timestamp UNIXタイムスタンプ
 * @returns 成功したかどうか
 */
export async function reportToStripe(
  stripeSecretKey: string,
  subscriptionItemId: string,
  quantity: number,
  timestamp: number
): Promise<{ success: boolean; error?: string }> {
  const url = `https://api.stripe.com/v1/subscription_items/${subscriptionItemId}/usage_records`;

  const body = new URLSearchParams({
    quantity: String(quantity),
    timestamp: String(timestamp),
    action: "set",
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return { success: false, error: `Stripe API error: ${response.status} ${errorBody}` };
  }

  return { success: true };
}

/**
 * 日次バッチ: 指定日の利用量をStripeに報告する
 * @param usageKV USAGE_LOGS KVバインディング
 * @param stripeSecretKey Stripe Secret Key
 * @param customerMap 顧客→SubscriptionItemのマッピング
 * @param date 対象日付（YYYY-MM-DD）
 * @returns 報告結果
 */
export async function runDailyReport(
  usageKV: KVNamespace,
  stripeSecretKey: string,
  customerMap: CustomerSubscriptionMap,
  date: string
): Promise<ReportResult[]> {
  const entries = await collectDailyUsage(usageKV, date);
  const results: ReportResult[] = [];

  // 日付をUNIXタイムスタンプに変換
  const timestamp = Math.floor(new Date(date).getTime() / 1000);

  for (const entry of entries) {
    const mapping = customerMap[entry.customerId];

    if (!mapping) {
      results.push({
        customerId: entry.customerId,
        count: entry.count,
        success: false,
        error: `No subscription item mapping for customer: ${entry.customerId}`,
      });
      continue;
    }

    const result = await reportToStripe(
      stripeSecretKey,
      mapping.subscriptionItemId,
      entry.count,
      timestamp
    );

    results.push({
      customerId: entry.customerId,
      count: entry.count,
      ...result,
    });
  }

  return results;
}
