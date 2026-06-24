/**
 * self-serve キー再発行の KV ロジック(トークン管理 + キー回転)
 *
 * 設計(master-plan v1.12 / 2026-06-25 経営者方針):
 *  - キーは決済直後の success ページで一度しか表示されず、平文は長期保存しない。
 *    紛失時は「再発行(rotate)」= 新キー発行 + 旧キー失効 で対応する(再表示ではない)。
 *  - なりすまし防止のため、メール所有検証を挟む2段階フロー:
 *      1) POST /reissue {email} → ワンタイムトークンを発行し登録メールへ検証リンク送信
 *      2) 検証リンクのページで確定 → 本モジュールが鍵を回転し新キーを一度だけ表示
 *  - per-request key(`shrb_`)と Hub License key(`shrb_lic_`)の両方を回転に統一。
 *  - customerId は据え置き(キー + ハッシュのみ回転)= stripe:customer-map 連鎖の更新を避ける。
 *
 * email 起点の逆引きは webhook が書く索引を使う:
 *  - per-request: `email:{email}` → apiKeyHash(routes/webhook.ts handleCheckoutCompleted)
 *  - license:     `license-email:{email}` → license key(同 handleLicenseCheckoutCompleted、本実装で追加)
 */
import { sha256Hex } from "../util/sha256.js";
import {
  generateLicenseKey,
  getLicense,
  licenseKvKey,
  putLicense,
} from "../licensing/license-store.js";
import { licenseStripeReverseKvKey } from "../licensing/license-checkout.js";

/** per-request key 索引の prefix(webhook が書く `email:{email}` → apiKeyHash)。 */
export const EMAIL_INDEX_PREFIX = "email:";
/** Hub License key 索引の prefix(`license-email:{email}` → license key)。 */
export const LICENSE_EMAIL_INDEX_PREFIX = "license-email:";
/** Stripe customer → per-request 逆引きの prefix(webhook と共通)。 */
export const STRIPE_REVERSE_PREFIX = "stripe-reverse:";
/** 再発行ワンタイムトークン(hash)の prefix。 */
export const REISSUE_TOKEN_PREFIX = "reissue-token:";
/** トークン TTL(30分 = 1800秒)。KV 最低 60 秒制約は満たす。 */
export const REISSUE_TOKEN_TTL = 1800;

/** APIキーに使うランダム英数字の文字セット(routes/checkout.ts と同一)。 */
const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 再発行の対象種別。 */
export type ReissueKind = "per_request" | "license";

/** ワンタイムトークンに紐づく再発行対象レコード(USAGE_LOGS に保存)。 */
export interface ReissueTokenRecord {
  kind: ReissueKind;
  /** per_request: 旧 apiKeyHash / license: 旧 license key 全文。 */
  ref: string;
  /** 索引更新と通知に使う登録メール。 */
  email: string;
  /** 発行時刻(ISO8601)。 */
  createdAt: string;
}

/** 再発行対象の解決結果。 */
export interface ReissueTarget {
  kind: ReissueKind;
  ref: string;
}

/**
 * shrb_ + 32文字ランダム英数字 の per-request API キーを生成する。
 *
 * ※ フォーマットは routes/checkout.ts の generateApiKey と一致させること
 *    (auth.ts の `^shrb_[a-zA-Z0-9]{32}$` で検証される)。
 */
export function generatePerRequestKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let key = "shrb_";
  for (let i = 0; i < 32; i++) {
    key += CHARSET[bytes[i] % CHARSET.length];
  }
  return key;
}

/** 64 hex のワンタイムトークンを生成する(URL に載せる平文、保存は hash)。 */
export function generateReissueToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * email から再発行対象を解決する。per-request を優先し、無ければ license を見る。
 *
 * `email:` / `license-email:` 索引はいずれも有償契約の checkout 完了時にのみ書かれるため、
 * 索引に存在する = 有償顧客(plan 再判定は不要)。
 *
 * @returns 対象(kind + ref)または null(該当なし)
 */
export async function resolveReissueTarget(
  usageLogs: KVNamespace,
  email: string
): Promise<ReissueTarget | null> {
  const apiKeyHash = await usageLogs.get(`${EMAIL_INDEX_PREFIX}${email}`);
  if (apiKeyHash) return { kind: "per_request", ref: apiKeyHash };
  const licenseKey = await usageLogs.get(`${LICENSE_EMAIL_INDEX_PREFIX}${email}`);
  if (licenseKey) return { kind: "license", ref: licenseKey };
  return null;
}

/** トークンを保存する(平文トークンの SHA-256 を key にする)。 */
export async function putReissueToken(
  usageLogs: KVNamespace,
  token: string,
  record: ReissueTokenRecord
): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await usageLogs.put(`${REISSUE_TOKEN_PREFIX}${tokenHash}`, JSON.stringify(record), {
    expirationTtl: Math.max(60, REISSUE_TOKEN_TTL),
  });
}

/**
 * トークンを検証して消費する(single-use: 読めたら即削除)。
 *
 * 削除を回転より前に行うことで、二重クリック / リンク再訪での二重回転を防ぐ。
 *
 * @returns 紐づくレコード、または null(未発行 / 失効 / 不正)
 */
export async function consumeReissueToken(
  usageLogs: KVNamespace,
  token: string
): Promise<ReissueTokenRecord | null> {
  const tokenHash = await sha256Hex(token);
  const key = `${REISSUE_TOKEN_PREFIX}${tokenHash}`;
  const raw = await usageLogs.get(key);
  if (!raw) return null;
  await usageLogs.delete(key);
  try {
    return JSON.parse(raw) as ReissueTokenRecord;
  } catch {
    return null;
  }
}

/**
 * per-request key を回転する。新しい平文キーを返す。対象が消えていれば null。
 *
 * - 既存レコード(legacy / aggregated とも customerId・stripeCustomerId を top-level に持つ)を
 *   そのまま新ハッシュへ移植(§9-3: customerId 据え置き)。
 * - 旧ハッシュを削除(旧キー失効)。
 * - `email:` 索引を新ハッシュへ更新。
 * - `stripe-reverse:` を新ハッシュへ更新(webhook の停止・復帰が旧ハッシュを叩かないように)。
 */
export async function rotatePerRequestKey(
  apiKeys: KVNamespace,
  usageLogs: KVNamespace,
  oldHash: string,
  email: string
): Promise<string | null> {
  const recordStr = await apiKeys.get(oldHash);
  if (!recordStr) return null;

  let stripeCustomerId: string | undefined;
  let customerId: string | undefined;
  try {
    const parsed = JSON.parse(recordStr) as {
      stripeCustomerId?: string;
      customerId?: string;
    };
    stripeCustomerId = parsed.stripeCustomerId;
    customerId = parsed.customerId;
  } catch {
    // 破損レコードでも回転は続行(索引整合を優先)。
  }

  const newKey = generatePerRequestKey();
  const newHash = await sha256Hex(newKey);

  await apiKeys.put(newHash, recordStr);
  await apiKeys.delete(oldHash);
  await usageLogs.put(`${EMAIL_INDEX_PREFIX}${email}`, newHash);
  if (stripeCustomerId && customerId) {
    await usageLogs.put(
      `${STRIPE_REVERSE_PREFIX}${stripeCustomerId}`,
      `${customerId},${newHash}`
    );
  }
  return newKey;
}

/**
 * Hub License key を回転する。新しい license key を返す。対象が消えていれば null。
 *
 * - 既存 license レコードを新キーで再保存(putLicense が updatedAt 更新)。
 * - 旧キーの `license:{oldKey}` を削除(旧キー失効)。
 * - `license-email:` 索引を新キーへ更新。
 * - `license-stripe-reverse:` を新キーへ更新(webhook の status 遷移用)。
 */
export async function rotateLicenseKey(
  apiKeys: KVNamespace,
  usageLogs: KVNamespace,
  oldKey: string,
  email: string
): Promise<string | null> {
  const license = await getLicense(apiKeys, oldKey);
  if (!license) return null;

  const newKey = generateLicenseKey();
  await putLicense(apiKeys, { ...license, licenseKey: newKey });
  await apiKeys.delete(licenseKvKey(oldKey));
  await usageLogs.put(`${LICENSE_EMAIL_INDEX_PREFIX}${email}`, newKey);
  if (license.stripeCustomerId) {
    await usageLogs.put(licenseStripeReverseKvKey(license.stripeCustomerId), newKey);
  }
  return newKey;
}

/**
 * トークンレコードに従ってキーを回転する(per_request / license を分岐)。
 *
 * @returns 新しい平文キー、または null(対象喪失)
 */
export async function rotateByToken(
  apiKeys: KVNamespace,
  usageLogs: KVNamespace,
  record: ReissueTokenRecord
): Promise<string | null> {
  if (record.kind === "per_request") {
    return rotatePerRequestKey(apiKeys, usageLogs, record.ref, record.email);
  }
  return rotateLicenseKey(apiKeys, usageLogs, record.ref, record.email);
}
