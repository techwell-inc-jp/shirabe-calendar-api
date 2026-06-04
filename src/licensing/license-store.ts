/**
 * Hub license の KV 永続化ヘルパ(#19 backend 非 Stripe 部)
 *
 * 格納先: 既存 API_KEYS KV namespace(新設なし = 非 infra)、`license:{licenseKey}` key。
 * license key format は per-request key(CLAUDE.md §7、`shrb_` + 32 文字英数字、
 * routes/checkout.ts の generateApiKey)に倣い `shrb_lic_` + 32 文字英数字とする。
 * per-request key 判定 `^shrb_[a-zA-Z0-9]{32}$`(auth.ts)は underscore を含む license key
 * とは一致しないため、両者は衝突しない。
 *
 * ★ 発行(self-issue)・課金は #19 Stripe part(2026-06-09 以降)。Stripe Checkout 完了
 *   webhook が generateLicenseKey → putLicense を呼ぶ。本ファイルは key 生成・正規化・
 *   KV I/O のみ(skeleton)。
 */

import type { LicenseSku, LicensedApi, StoredLicense } from "../types/license.js";
import { SKU_ENTITLED_APIS } from "../types/license.js";

/** license key の prefix(per-request `shrb_` と判別)。 */
export const LICENSE_KEY_PREFIX = "shrb_lic_";

/** prefix を除いた本体長(per-request key と同じ 32 文字)。 */
const LICENSE_KEY_BODY_LEN = 32;

/** key 本体に用いる文字集合(checkout.ts の CHARSET と同一)。 */
const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** license key 形状の検証用パターン(`shrb_lic_` + 32 文字英数字)。 */
const LICENSE_KEY_PATTERN = new RegExp(`^${LICENSE_KEY_PREFIX}[A-Za-z0-9]{${LICENSE_KEY_BODY_LEN}}$`);

/** KV(API_KEYS)上の license レコード key を組み立てる。 */
export function licenseKvKey(licenseKey: string): string {
  return `license:${licenseKey}`;
}

/** license key 形状判定(`shrb_lic_` + 32 文字英数字)。 */
export function isLicenseKey(key: string): boolean {
  return LICENSE_KEY_PATTERN.test(key);
}

/**
 * 暗号学的に安全な license key を生成する(Web Crypto、per-request key と同方式)。
 *
 * @returns `shrb_lic_` + 32 文字英数字
 */
export function generateLicenseKey(): string {
  const bytes = new Uint8Array(LICENSE_KEY_BODY_LEN);
  crypto.getRandomValues(bytes);
  let body = "";
  for (let i = 0; i < LICENSE_KEY_BODY_LEN; i++) {
    body += CHARSET[bytes[i] % CHARSET.length];
  }
  return `${LICENSE_KEY_PREFIX}${body}`;
}

/**
 * 新規 license レコードを組み立てる(純粋関数、KV 書込はしない)。
 *
 * entitledApis は SKU から導出する。Stripe 関連 field は Stripe part で後付けするため
 * 未設定(undefined)で返す。
 *
 * @param params customerId / sku / 任意の email・Stripe ID・生成時刻
 * @returns active 状態の StoredLicense
 */
export function buildLicense(params: {
  licenseKey: string;
  customerId: string;
  sku: LicenseSku;
  email?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  /** 生成時刻(ISO8601)。省略時は new Date()。テスト決定性のため注入可能。 */
  now?: string;
  /** SKU 既定を上書きする場合の entitlement(通常は省略)。 */
  entitledApis?: LicensedApi[];
}): StoredLicense {
  const now = params.now ?? new Date().toISOString();
  return {
    licenseKey: params.licenseKey,
    customerId: params.customerId,
    sku: params.sku,
    entitledApis: params.entitledApis ?? [...SKU_ENTITLED_APIS[params.sku]],
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...(params.email !== undefined ? { email: params.email } : {}),
    ...(params.stripeCustomerId !== undefined ? { stripeCustomerId: params.stripeCustomerId } : {}),
    ...(params.stripeSubscriptionId !== undefined
      ? { stripeSubscriptionId: params.stripeSubscriptionId }
      : {}),
  };
}

/**
 * KV から license を読み取る。存在しない / JSON 不正なら null。
 *
 * @param kv API_KEYS namespace
 * @param licenseKey license key 全文
 * @returns StoredLicense または null
 */
export async function getLicense(
  kv: KVNamespace,
  licenseKey: string
): Promise<StoredLicense | null> {
  if (!isLicenseKey(licenseKey)) return null;
  const raw = await kv.get(licenseKvKey(licenseKey));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredLicense;
  } catch {
    return null;
  }
}

/**
 * license を KV に書き込む(upsert)。updatedAt を書込時刻に更新する。
 *
 * license は flat-sub(無期限)なので TTL は付けない(per-request key 同様、
 * 解約は webhook で status=suspended / delete を駆動する Stripe part 管轄)。
 *
 * @param kv API_KEYS namespace
 * @param license 保存する license
 * @param now 更新時刻(ISO8601)。省略時は new Date()。テスト決定性のため注入可能。
 */
export async function putLicense(
  kv: KVNamespace,
  license: StoredLicense,
  now?: string
): Promise<void> {
  const record: StoredLicense = {
    ...license,
    updatedAt: now ?? new Date().toISOString(),
  };
  await kv.put(licenseKvKey(record.licenseKey), JSON.stringify(record));
}
