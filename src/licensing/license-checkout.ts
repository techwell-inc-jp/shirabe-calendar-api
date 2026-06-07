/**
 * Hub license の Stripe Checkout(#19 Lever 1 Stripe part、2026-06-09 開通)
 *
 * order:
 *   - shirabe-assets/implementation-orders/20260529-lever1-hub-license-self-issue.md(#19 backend)
 *   - shirabe-assets/implementation-orders/20260530-gap1-org-self-serve-licensing-funnel.md(funnel)
 *
 * 非 Stripe skeleton(license-store.ts / self-issue.ts)に対し、本ファイルは
 * **実際の課金導線**を担う:
 *   1. flat recurring Price(SKU 別)への Stripe Checkout Session を作成
 *   2. license key を先行生成 → hash を session metadata に載せる
 *   3. checkout 完了 webhook(routes/webhook.ts)が pending を引いて license を active 化
 *
 * per-request key の checkout(routes/checkout.ts)と同型だが、metered ではなく
 * **flat subscription**(quantity=1)で、metadata.kind="license" で webhook 分岐する。
 *
 * Stripe SDK は使わず fetch で REST API を直接呼ぶ(Cloudflare Workers 互換、CLAUDE.md §4)。
 */
import type { AnalyticsEngineDataset, Env } from "../types/env.js";
import type { LicenseSku } from "../types/license.js";

/** license-pending(checkout 完了まで license key 平文を保持)の KV prefix。 */
export const LICENSE_PENDING_PREFIX = "license-pending:";
/** Stripe customer → license key 逆引き(webhook の status 遷移用)の KV prefix。 */
export const LICENSE_STRIPE_REVERSE_PREFIX = "license-stripe-reverse:";
/** license-pending の TTL(1 時間 = 3600 秒、per-request checkout と同値)。 */
export const LICENSE_PENDING_TTL = 3600;

/** checkout 完了まで KV(USAGE_LOGS)に一時保持する license 情報(success ページが key を表示)。 */
export interface LicensePending {
  /** 発行予定の license key 全文(`shrb_lic_` + 32 文字)。 */
  licenseKey: string;
  /** 契約 SKU。 */
  sku: LicenseSku;
  /** 契約者メール(通知 / 照合用)。 */
  email: string;
}

/** AE 上で license checkout 開始イベントを識別する index marker。 */
export const LICENSE_CHECKOUT_INITIATED_INDEX = "license_checkout_initiated";

/**
 * SKU に対応する flat recurring Stripe Price ID を環境変数から取得する(純粋関数)。
 *
 * 未設定(発行前 / 設定漏れ)の SKU は undefined を返す(呼出側で 500 整形)。
 *
 * @param sku license SKU
 * @param env Workers バインディング
 * @returns Price ID または undefined
 */
export function getLicensePriceId(sku: LicenseSku, env: Env): string | undefined {
  const map: Record<LicenseSku, string | undefined> = {
    address_managed: env.STRIPE_PRICE_ADDRESS_MANAGED,
    hub_pro: env.STRIPE_PRICE_HUB_PRO,
    hub_enterprise: env.STRIPE_PRICE_HUB_ENTERPRISE,
  };
  return map[sku];
}

/** license-pending の KV key を組み立てる。 */
export function licensePendingKvKey(licenseKeyHash: string): string {
  return `${LICENSE_PENDING_PREFIX}${licenseKeyHash}`;
}

/** Stripe customer → license key 逆引きの KV key を組み立てる。 */
export function licenseStripeReverseKvKey(stripeCustomerId: string): string {
  return `${LICENSE_STRIPE_REVERSE_PREFIX}${stripeCustomerId}`;
}

/**
 * Stripe Checkout Session を作成する(fetch で Stripe REST API を直接呼ぶ)。
 *
 * flat subscription(quantity=1)。metadata.kind="license" で webhook が per-request key の
 * checkout と分岐する。license key 平文は metadata に載せず、hash のみ載せて pending から引く。
 *
 * @returns checkout URL
 * @throws Stripe API がエラーを返した場合
 */
export async function createLicenseCheckoutSession(params: {
  priceId: string;
  licenseKeyHash: string;
  sku: LicenseSku;
  email: string;
  stripeSecretKey: string;
}): Promise<{ url: string }> {
  const body = new URLSearchParams();
  body.append("mode", "subscription");
  body.append("line_items[0][price]", params.priceId);
  // flat recurring(usage_type=licensed)なので quantity を指定する(metered とは異なる)。
  body.append("line_items[0][quantity]", "1");
  body.append("customer_email", params.email);
  body.append("metadata[kind]", "license");
  body.append("metadata[licenseKeyHash]", params.licenseKeyHash);
  body.append("metadata[sku]", params.sku);
  // subscription 側 metadata にも複製(invoice.* webhook は subscription 経由で参照しうる)。
  body.append("subscription_data[metadata][kind]", "license");
  body.append("subscription_data[metadata][licenseKeyHash]", params.licenseKeyHash);
  body.append(
    "success_url",
    "https://shirabe.dev/licenses/checkout/success?session_id={CHECKOUT_SESSION_ID}"
  );
  body.append("cancel_url", "https://shirabe.dev/checkout/cancel");

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(params.stripeSecretKey + ":")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stripe API error (${res.status}): ${err}`);
  }

  const session = (await res.json()) as { url: string };
  return { url: session.url };
}

/**
 * license-pending を KV(USAGE_LOGS)に一時保存する(TTL 付き)。
 *
 * @param kv USAGE_LOGS namespace
 * @param licenseKeyHash license key の SHA-256(metadata と一致させる)
 * @param pending 保存する license 情報
 * @param ttl 秒(省略時 LICENSE_PENDING_TTL)。CLAUDE.md の KV 最低 60 秒は本値で満たす。
 */
export async function putLicensePending(
  kv: KVNamespace,
  licenseKeyHash: string,
  pending: LicensePending,
  ttl: number = LICENSE_PENDING_TTL
): Promise<void> {
  await kv.put(licensePendingKvKey(licenseKeyHash), JSON.stringify(pending), {
    expirationTtl: Math.max(60, ttl),
  });
}

/**
 * license-pending を KV から読む。存在しない / JSON 不正なら null。
 *
 * @param kv USAGE_LOGS namespace
 * @param licenseKeyHash license key の SHA-256
 * @returns LicensePending または null
 */
export async function getLicensePending(
  kv: KVNamespace,
  licenseKeyHash: string
): Promise<LicensePending | null> {
  const raw = await kv.get(licensePendingKvKey(licenseKeyHash));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LicensePending;
  } catch {
    return null;
  }
}

/**
 * license checkout 開始イベントを Analytics Engine に記録する(funnel checkout 段)。
 *
 * PII 非保持(email・生 license key は書かない)。self-issue intent(initiation)→ checkout
 * → paid(webhook)の funnel に「checkout(開始)」段を足す。失敗はレスポンスに影響させない。
 *
 * blobs:  0: イベント種別 "license_checkout_initiated"  1: SKU
 * doubles: 0: 月額(円)
 * indexes: ["license_checkout_initiated"]
 *
 * @param dataset Analytics Engine binding(未設定ならスキップ)
 * @param sku 契約 SKU
 * @param monthlyPriceJpy 月額(円)
 */
export function emitLicenseCheckoutInitiatedSignal(
  dataset: AnalyticsEngineDataset | undefined,
  sku: LicenseSku,
  monthlyPriceJpy: number
): void {
  if (!dataset || typeof dataset.writeDataPoint !== "function") return;
  try {
    dataset.writeDataPoint({
      blobs: [LICENSE_CHECKOUT_INITIATED_INDEX, sku],
      doubles: [monthlyPriceJpy],
      indexes: [LICENSE_CHECKOUT_INITIATED_INDEX],
    });
  } catch (err) {
    console.error("[license-checkout] writeDataPoint failed", err);
  }
}
