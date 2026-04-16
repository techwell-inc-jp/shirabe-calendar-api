/**
 * レート制限ミドルウェア
 *
 * Cloudflare KVでリクエスト数をカウントし、プランごとの制限を適用する。
 *
 * プランごとの制限:
 * - Free: 1 req/s, 1,000/月
 * - Starter: 10 req/s, 50,000/月
 * - Pro: 50 req/s, 500,000/月
 * - Enterprise: 100 req/s, 無制限
 */
import type { Context, Next } from "hono";
import type { AppEnv } from "../types/env.js";

/** プランごとのレート制限設定 */
export const PLAN_LIMITS = {
  free: { perSecond: 1, perMonth: 1_000 },
  starter: { perSecond: 10, perMonth: 50_000 },
  pro: { perSecond: 50, perMonth: 500_000 },
  enterprise: { perSecond: 100, perMonth: -1 }, // -1 = 無制限
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

/**
 * Cloudflare KV の expiration_ttl 最小値（秒）。
 * これより小さい値を put に渡すと 400 Bad Request が返る。
 */
const KV_MIN_TTL_SEC = 60;

/**
 * 秒次カウンターの TTL（秒）。
 *
 * カウンターは「秒タイムスタンプ」をキーに含むため（`rate:second:{cust}:{sec}`）、
 * TTL の長短はレート制限のセマンティクスに影響しない。古いキーが少し長く残るだけ。
 * Cloudflare KV の最小値 60 秒を採用する。
 */
const SECOND_KEY_TTL = KV_MIN_TTL_SEC;

/**
 * 現在の月のリセット日時（翌月1日0時UTC）をISO文字列で返す
 */
function getMonthlyResetDate(): string {
  const now = new Date();
  const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const month = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
  return new Date(year, month, 1).toISOString();
}

/**
 * 月次カウンターのKVキーを生成する
 */
function getMonthlyKey(customerId: string): string {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `rate:monthly:${customerId}:${ym}`;
}

/**
 * 秒次カウンターのKVキーを生成する
 */
function getSecondKey(customerId: string): string {
  const now = new Date();
  const sec = Math.floor(now.getTime() / 1000);
  return `rate:second:${customerId}:${sec}`;
}

/**
 * レート制限ミドルウェア
 */
export async function rateLimitMiddleware(c: Context<AppEnv>, next: Next) {
  const plan = c.get("plan") as PlanType;
  const customerId = c.get("customerId") as string;

  if (!plan || !customerId) {
    // authミドルウェアを通過していない場合は通す
    await next();
    return;
  }

  const limits = PLAN_LIMITS[plan];
  const rateLimitsKV = c.env.RATE_LIMITS;

  // 月次チェック
  const monthlyKey = getMonthlyKey(customerId);
  const monthlyCountStr = await rateLimitsKV.get(monthlyKey);
  const monthlyCount = monthlyCountStr ? parseInt(monthlyCountStr, 10) : 0;

  if (limits.perMonth > 0 && monthlyCount >= limits.perMonth) {
    const resetDate = getMonthlyResetDate();
    c.header("X-RateLimit-Limit", String(limits.perMonth));
    c.header("X-RateLimit-Remaining", "0");
    c.header("X-RateLimit-Reset", resetDate);

    return c.json(
      {
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: `Rate limit exceeded. Retry after ${resetDate}`,
          details: {
            limit: limits.perMonth,
            remaining: 0,
            reset: resetDate,
          },
        },
      },
      429
    );
  }

  // 秒次チェック
  const secondKey = getSecondKey(customerId);
  const secondCountStr = await rateLimitsKV.get(secondKey);
  const secondCount = secondCountStr ? parseInt(secondCountStr, 10) : 0;

  if (secondCount >= limits.perSecond) {
    const remaining = limits.perMonth > 0 ? limits.perMonth - monthlyCount : -1;
    c.header("X-RateLimit-Limit", String(limits.perMonth > 0 ? limits.perMonth : "unlimited"));
    c.header("X-RateLimit-Remaining", String(remaining >= 0 ? remaining : "unlimited"));
    c.header("X-RateLimit-Reset", getMonthlyResetDate());

    return c.json(
      {
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests per second. Please slow down.",
          details: {
            limit_per_second: limits.perSecond,
          },
        },
      },
      429
    );
  }

  // カウンターを更新（非同期、レスポンスを待たない）
  const monthlyTTL = Math.ceil(
    (new Date(getMonthlyResetDate()).getTime() - Date.now()) / 1000
  );

  // KVの書き込みはwaitUntilで非同期実行（c.executionCtxがある場合）
  const updateCounters = async () => {
    await rateLimitsKV.put(monthlyKey, String(monthlyCount + 1), {
      expirationTtl: Math.max(monthlyTTL, KV_MIN_TTL_SEC),
    });
    // Cloudflare KV は expiration_ttl >= 60 を要求する。秒次カウンターはキーに
    // タイムスタンプが含まれるため、TTL 60 秒でもセマンティクスは不変。
    await rateLimitsKV.put(secondKey, String(secondCount + 1), {
      expirationTtl: SECOND_KEY_TTL,
    });
  };

  // executionCtxがあればwaitUntilで非同期、なければawait
  try {
    const ctx = c.executionCtx;
    if (ctx && "waitUntil" in ctx) {
      ctx.waitUntil(updateCounters());
    } else {
      await updateCounters();
    }
  } catch {
    await updateCounters();
  }

  // レスポンスヘッダーに残リクエスト数を設定
  const remaining = limits.perMonth > 0 ? limits.perMonth - monthlyCount - 1 : -1;
  c.header("X-RateLimit-Limit", String(limits.perMonth > 0 ? limits.perMonth : "unlimited"));
  c.header("X-RateLimit-Remaining", String(remaining >= 0 ? remaining : "unlimited"));
  c.header("X-RateLimit-Reset", getMonthlyResetDate());

  await next();
}
