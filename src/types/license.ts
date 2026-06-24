/**
 * Hub license のデータモデル + KV schema(#19 backend 非 Stripe 部)
 *
 * order:
 *   - shirabe-assets/implementation-orders/20260529-lever1-hub-license-self-issue.md(#19 backend)
 *   - shirabe-assets/implementation-orders/20260530-gap1-org-self-serve-licensing-funnel.md(funnel)
 *
 * per-request API key(`shrb_`、types/api-key.ts)とは別レイヤの「flat license」を表す。
 * license は B2B 4 大 identifier(住所・人名/text・暦・法人番号)を 1 契約 1 key で横断利用
 * する権利を表現する(master-plan v1.12: 単独 per-API が主経路 / Hub License は横断利用の二次商品)。
 *
 * ★ 本ファイルは非 Stripe 部(データモデル + KV schema のみ)。実際の発行・課金
 *   (Stripe Checkout / flat-sub / webhook)は #19 Stripe part(2026-06-09 以降)で
 *   `stripeSubscriptionId` / `status` を webhook 駆動で埋める。
 *
 * ★ KV namespace は新設しない(非 infra)。既存 API_KEYS namespace 内に
 *   `license:{licenseKey}` prefix で格納する(license-store.ts の licenseKvKey 参照)。
 */

import type { SkuId } from "../pricing/quote.js";

/** license 対象 SKU。per_request は license 契約ではないため除外。 */
export type LicenseSku = Exclude<SkuId, "per_request">;

/**
 * license の状態。
 * - active: 利用可能
 * - suspended: 支払い失敗等で一時停止(Stripe part の webhook が遷移を駆動)
 */
export type LicenseStatus = "active" | "suspended";

/** Shirabe ファミリーの API 名(entitlement 対象)。quote.ts の ApiName と同一空間。 */
export type LicensedApi = "address" | "text" | "calendar" | "corporation";

/**
 * KV(API_KEYS namespace、`license:{licenseKey}`)に保存される license レコード。
 *
 * PII 最小化: email は通知/照合用に任意保持のみ。生 API キー・IP は保持しない。
 */
export type StoredLicense = {
  /** license key 全文(`shrb_lic_` + 32 文字)。自己整合チェック用に値内にも保持。 */
  licenseKey: string;
  /** 契約者(org)識別子。per-request key の customerId と同一空間。 */
  customerId: string;
  /** 契約 SKU。 */
  sku: LicenseSku;
  /** この license が横断利用を許可する API 群(entitlement の機械判定用)。 */
  entitledApis: LicensedApi[];
  /** 状態。発行直後は "active"(以降 Stripe part の webhook が更新)。 */
  status: LicenseStatus;
  /** 作成時刻(ISO8601)。 */
  createdAt: string;
  /** 最終更新時刻(ISO8601)。 */
  updatedAt: string;
  /** 契約者メール(通知先、任意)。 */
  email?: string;
  /** Stripe 顧客 ID(Stripe part で設定)。 */
  stripeCustomerId?: string;
  /** Stripe Subscription ID(flat-sub、Stripe part で設定)。 */
  stripeSubscriptionId?: string;
};

/**
 * SKU 別のデフォルト entitlement(横断利用を許可する API 群)。
 *
 * - address_managed: 住所単体の managed 契約
 * - hub_pro / hub_enterprise: B2B 4 大 identifier 全体(法人番号は 2026-06 リリースで追加)
 *
 * quote.ts の SKU.entitlements(人間可読な権利説明)と整合させた機械判定用の表。
 */
export const SKU_ENTITLED_APIS: Record<LicenseSku, readonly LicensedApi[]> = {
  address_managed: ["address"],
  hub_pro: ["address", "text", "calendar", "corporation"],
  hub_enterprise: ["address", "text", "calendar", "corporation"],
} as const;

/**
 * license が指定 API の横断利用を許可しているか判定する(純粋関数)。
 *
 * active かつ entitledApis に含まれる場合のみ true。suspended は常に false。
 *
 * @param license 対象 license レコード
 * @param api 判定対象 API
 * @returns 許可されていれば true
 */
export function licenseGrants(license: StoredLicense, api: LicensedApi): boolean {
  return license.status === "active" && license.entitledApis.includes(api);
}
