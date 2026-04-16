/**
 * 利用量ログミドルウェア
 *
 * リクエストごとにCloudflare KVに利用量を記録する。
 * 顧客ID + 日付をキーとしてカウントする。
 * 日次バッチでStripeに報告するためのデータを蓄積する。
 */
import type { Context, Next } from "hono";
import type { AppEnv } from "../types/env.js";

/**
 * 利用量ログのKVキーを生成する
 * 形式: usage:{customerId}:{YYYY-MM-DD}
 */
function getUsageKey(customerId: string): string {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `usage:${customerId}:${date}`;
}

/**
 * 日付インデックスのKVキーを生成する
 * 形式: usage-index:{YYYY-MM-DD}
 * 値: カンマ区切りのcustomerIdリスト
 */
function getIndexKey(): string {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `usage-index:${date}`;
}

/**
 * 月間利用量カウントのKVキーを生成する
 * 形式: usage-monthly:{customerId}:{YYYY-MM}
 */
function getMonthlyUsageKey(customerId: string): string {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `usage-monthly:${customerId}:${ym}`;
}

/** 月間利用量カウンターのTTL（35日 = 月をまたいでも余裕を持つ） */
const MONTHLY_USAGE_TTL = 35 * 24 * 60 * 60;

/**
 * 利用量ログミドルウェア
 */
export async function usageLoggerMiddleware(c: Context<AppEnv>, next: Next) {
  // まずリクエストを処理
  await next();

  // レスポンスが正常の場合のみカウント
  if (c.res.status >= 200 && c.res.status < 400) {
    const customerId = c.get("customerId") as string | undefined;
    if (!customerId) return;

    const usageKV = c.env.USAGE_LOGS;
    const usageKey = getUsageKey(customerId);

    const recordUsage = async () => {
      // 利用量カウントを加算
      const currentStr = await usageKV.get(usageKey);
      const current = currentStr ? parseInt(currentStr, 10) : 0;
      // 7日間のTTL（日次バッチで処理されるため、余裕を持つ）
      await usageKV.put(usageKey, String(current + 1), {
        expirationTtl: 7 * 24 * 60 * 60,
      });

      // 月間利用量カウントを加算（Phase 2: usage-check用）
      const monthlyKey = getMonthlyUsageKey(customerId);
      const monthlyStr = await usageKV.get(monthlyKey);
      const monthlyCurrent = monthlyStr ? parseInt(monthlyStr, 10) : 0;
      await usageKV.put(monthlyKey, String(monthlyCurrent + 1), {
        expirationTtl: MONTHLY_USAGE_TTL,
      });

      // 日付インデックスにcustomerIdを追加
      const indexKey = getIndexKey();
      const indexStr = await usageKV.get(indexKey);
      const customerIds = indexStr ? new Set(indexStr.split(",")) : new Set<string>();
      if (!customerIds.has(customerId)) {
        customerIds.add(customerId);
        await usageKV.put(indexKey, Array.from(customerIds).join(","), {
          expirationTtl: 7 * 24 * 60 * 60,
        });
      }
    };

    try {
      const ctx = c.executionCtx;
      if (ctx && "waitUntil" in ctx) {
        ctx.waitUntil(recordUsage());
      } else {
        await recordUsage();
      }
    } catch {
      await recordUsage();
    }
  }
}

// テスト用にエクスポート
export { getUsageKey, getIndexKey, getMonthlyUsageKey };
