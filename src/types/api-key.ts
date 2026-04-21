/**
 * KV API_KEYS に保存されるデータ構造定義(暦 API 側)
 *
 * shirabe-address-api と **同一の型定義**。1 キー集約構造(新フォーマット)と
 * 暦 API 単独時代のフラット形式(旧フォーマット)の両方を読み取り可能にする。
 *
 * 参照: ../../../shirabe-address-api/src/types/api-key.ts
 *       ../../../shirabe-address-api/docs/kv-api-keys-design.md
 *
 * Phase 1(2026-04-22〜5/6):
 *   - auth.ts は resolveApiPlan 経由で両フォーマットを透過的に読み取る
 *   - webhook.ts は引き続き旧フォーマットで書き込む(既存 244 テスト保全)
 *
 * Phase 2(5/6 以降):
 *   - Stripe Webhook を metadata.api_name 駆動の新フォーマット書込に移行
 *   - on-write migration により、通常の Stripe 更新時に自然に新フォーマット化
 */

/** 単一 API 内のプラン状態 */
export type ApiPlanInfo = {
  plan: "free" | "starter" | "pro" | "enterprise";
  /** 未設定は "active" 扱い */
  status?: "active" | "suspended";
  /** Stripe Subscription ID(該当プランが有償の場合) */
  stripeSubscriptionId?: string;
  /** 該当 API のプランが最後に更新された時刻(ISO8601) */
  updatedAt?: string;
};

/**
 * 【新フォーマット】1キー集約構造
 */
export type AggregatedApiKeyInfo = {
  customerId: string;
  stripeCustomerId?: string;
  email?: string;
  createdAt: string;
  apis: {
    calendar?: ApiPlanInfo;
    address?: ApiPlanInfo;
    [apiName: string]: ApiPlanInfo | undefined;
  };
};

/**
 * 【旧フォーマット】暦 API 単独時代のフラット形式
 */
export type LegacyApiKeyInfo = {
  plan: "free" | "starter" | "pro" | "enterprise";
  customerId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  email?: string;
  status?: "active" | "suspended";
  createdAt: string;
};

/**
 * KV から読み取る際の Union 型
 */
export type StoredApiKeyInfo = AggregatedApiKeyInfo | LegacyApiKeyInfo;

/** 新フォーマット判定(type guard) */
export function isAggregatedApiKeyInfo(
  info: StoredApiKeyInfo
): info is AggregatedApiKeyInfo {
  return "apis" in info && typeof (info as AggregatedApiKeyInfo).apis === "object";
}

/**
 * 旧フォーマット → 新フォーマット への読み取り時変換(in-memory のみ、KV 書き戻しなし)
 *
 * 旧フォーマットは暦 API のプランを表していたため、`apis.calendar` に
 * マップする。住所 API のプランは未設定扱い(= `apis.address` なし)。
 */
export function migrateToAggregated(
  legacy: LegacyApiKeyInfo
): AggregatedApiKeyInfo {
  return {
    customerId: legacy.customerId,
    stripeCustomerId: legacy.stripeCustomerId,
    email: legacy.email,
    createdAt: legacy.createdAt,
    apis: {
      calendar: {
        plan: legacy.plan,
        status: legacy.status ?? "active",
        stripeSubscriptionId: legacy.stripeSubscriptionId,
      },
    },
  };
}

/**
 * 特定 API の ApiPlanInfo を取得するヘルパ
 *
 * - 新フォーマットならそのまま `apis[apiName]` を返す
 * - 旧フォーマットなら `migrateToAggregated` を通して `calendar` 相当を返す
 * - 対象 API が未契約なら undefined を返す(呼び出し側で匿名 Free 扱い)
 */
export function resolveApiPlan(
  stored: StoredApiKeyInfo,
  apiName: "calendar" | "address"
): ApiPlanInfo | undefined {
  const aggregated = isAggregatedApiKeyInfo(stored)
    ? stored
    : migrateToAggregated(stored);
  return aggregated.apis[apiName];
}

/**
 * customerId を `StoredApiKeyInfo` から取得するヘルパ(新旧両対応)
 */
export function getCustomerId(stored: StoredApiKeyInfo): string {
  return stored.customerId;
}
