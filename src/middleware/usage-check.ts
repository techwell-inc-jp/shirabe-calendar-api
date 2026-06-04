/**
 * 月間利用量チェックミドルウェア（Phase 2）
 *
 * 月間利用量が各プランの上限を超えている場合は HTTP 429 を返し、
 * アップグレード導線（upgrade_url）を併せて返却する。
 *
 * プランごとの月間上限(canonical: shirabe-calendar/CLAUDE.md §6 + master-plan.md):
 * - Free:       10,000回
 * - Starter:   500,000回
 * - Pro:     5,000,000回
 * - Enterprise: 無制限
 *
 * 月間カウントは `usage-monthly:{customerId}:{YYYY-MM}` から読み取る。
 * カウントのインクリメントは usage-logger ミドルウェアで実施する。
 *
 * 429 response shape は AI agent が 1 hop で paid 切替できるよう
 * `upgrade_url` / `pricing_url` / `next_plan` / `current_plan` を含む
 * (C-1 paid 突破経路 ergonomics、`plan-pricing.ts` 参照)。
 */
import type { Context, Next } from "hono";
import type { AppEnv } from "../types/env.js";
import type { StoredApiKeyInfo } from "../types/api-key.js";
import type { ApiName } from "../pricing/quote.js";
import {
  NEXT_PLAN_MAP,
  PLAN_MONTHLY_LIMITS,
  PRICING_URL,
  UPGRADE_URL,
  secondsUntilMonthlyReset,
  type PlanName,
} from "./plan-pricing.js";
import {
  decideLicenseSurface,
  emitLicenseSurfaceSignal,
  licenseRecommendationToJson,
  paidApisFromStoredKey,
  type LicenseRecommendation,
} from "../licensing/surface.js";

/** 当 repo が表す API context(surface 判定の母集団に常に含める)。 */
const API_CONTEXT: ApiName = "calendar";

/** プランごとの月間利用量上限（-1 = 無制限） */
export const MONTHLY_USAGE_LIMITS = PLAN_MONTHLY_LIMITS;

export type UsagePlanType = PlanName;

// 後方互換: 既存テストや外部依存のために UPGRADE_URL を re-export
export { UPGRADE_URL };

/**
 * 月間利用量カウントのKVキーを生成する
 * 形式: usage-monthly:{customerId}:{YYYY-MM}
 */
export function getMonthlyUsageKey(customerId: string, now: Date = new Date()): string {
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `usage-monthly:${customerId}:${ym}`;
}

/**
 * プラン別の上限超過メッセージを生成する
 */
function buildLimitMessage(plan: UsagePlanType, limit: number): string {
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  return `${planLabel} plan limit (${limit.toLocaleString("en-US")} requests/month) reached. Upgrade to continue.`;
}

/**
 * 月間利用量チェックミドルウェア
 */
export async function usageCheckMiddleware(c: Context<AppEnv>, next: Next) {
  const plan = c.get("plan") as UsagePlanType | undefined;
  const customerId = c.get("customerId") as string | undefined;

  // auth を通過していない場合は素通し
  if (!plan || !customerId) {
    await next();
    return;
  }

  const limit = MONTHLY_USAGE_LIMITS[plan];

  // Enterprise（-1）は無制限
  if (limit < 0) {
    await next();
    return;
  }

  const usageKV = c.env.USAGE_LOGS;
  const key = getMonthlyUsageKey(customerId);
  const currentStr = await usageKV.get(key);
  const current = currentStr ? parseInt(currentStr, 10) : 0;

  if (current >= limit) {
    const nextPlan = NEXT_PLAN_MAP[plan];
    c.header("Retry-After", String(secondsUntilMonthlyReset()));

    // 穴1 設計A: 経済合理が立つ利用者にのみ license を additive 提示する(過剰提示回避)。
    // upgrade_url(per-request 上位プラン)と license_recommend(flat license)は併存し、
    // AI エージェントは X-Shirabe-Recommend ヘッダで license 提示を 1 hop 判定できる。
    const licenseRecommend = await buildLicenseRecommend(c, plan, current);
    if (licenseRecommend) {
      c.header("X-Shirabe-Recommend", licenseRecommend.sku);
    }

    return c.json(
      {
        error: {
          code: "USAGE_LIMIT_EXCEEDED",
          message: buildLimitMessage(plan, limit),
          upgrade_url: UPGRADE_URL,
          pricing_url: PRICING_URL,
          current_plan: {
            name: plan,
            monthly_limit: limit,
            monthly_used: current,
          },
          ...(nextPlan ? { next_plan: nextPlan } : {}),
          ...(licenseRecommend
            ? { license_recommend: licenseRecommendationToJson(licenseRecommend) }
            : {}),
        },
      },
      429
    );
  }

  await next();
}

/**
 * 429 応答に注入する license 提示ブロックを組み立てる(穴1 設計A、surface skeleton)。
 *
 * 当該顧客の有償 cross-API 群を API_KEYS から導出し、`decideLicenseSurface` で経済合理を
 * 判定する。提示する場合は AE に surface signal を記録する(funnel 起点、§6)。
 * 計測・読取の失敗はレスポンスに影響させない(握りつぶして null)。
 *
 * @param c Hono context(auth 通過後、apiKeyHash が設定済み想定)
 * @param plan 現プラン(AE 記録用)
 * @param monthlyVolume 当 API の月間利用量(break-even 比較に使う)
 * @returns 提示ブロック、または提示しない場合 null
 */
async function buildLicenseRecommend(
  c: Context<AppEnv>,
  plan: UsagePlanType,
  monthlyVolume: number
): Promise<LicenseRecommendation | null> {
  try {
    let paidApis: ApiName[] = [];
    const apiKeyHash = c.get("apiKeyHash") as string | undefined;
    if (apiKeyHash) {
      const raw = await c.env.API_KEYS.get(apiKeyHash);
      if (raw) {
        const stored = JSON.parse(raw) as StoredApiKeyInfo;
        paidApis = paidApisFromStoredKey(stored);
      }
    }

    const recommend = decideLicenseSurface({
      apiContext: API_CONTEXT,
      paidApis,
      monthlyVolume,
    });

    if (recommend) {
      emitLicenseSurfaceSignal(c.env.ANALYTICS, {
        sku: recommend.sku,
        apiContext: API_CONTEXT,
        plan,
        paidApiCount: paidApis.length,
        monthlyVolume,
      });
    }

    return recommend;
  } catch (err) {
    // surface は補助機能。失敗しても 429 本体は返す。
    console.error("[usage-check] license surface failed", err);
    return null;
  }
}
