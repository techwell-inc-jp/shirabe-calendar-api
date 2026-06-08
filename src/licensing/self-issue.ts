/**
 * License self-issue intent ロジック + AE signal(#19 backend 非 Stripe 部、skeleton)
 *
 * order:
 *   - shirabe-assets/implementation-orders/20260530-gap1-org-self-serve-licensing-funnel.md §2 ④ / §5
 *   - (#19 backend = license key 発行・課金 Checkout、本ファイルはその非課金 skeleton)
 *
 * ファネル ④「AI 仲介の契約 initiation」の受け口。org 代理 AI / 開発者が SKU を指定して
 * license 調達を initiate する。本ファイルは intent(価格・entitlement・次手導線)を返す非課金部。
 * 実際の license key 発行・Stripe flat-sub Checkout・webhook による active 化は #19 Stripe part
 * (POST /api/v1/licenses/checkout、2026-06-09 本番開通済み)が担う。
 *
 * ★ 「動かない導線を今すぐ契約可と偽らない」(`feedback_verify_before_assert` 整合):
 *   self-issue は license を即時 active 化せず、status="checkout_required" で
 *   「active 化には checkout 完了が必要」を honest に返す。checkout 自体は available_now。
 *
 * ★ PII 非保持: 入力の email / customer_id は #19 Stripe part が使う forward-compat field。
 *   本 skeleton は echo せず、AE signal にも含めない(PII 最小化、surface.ts と同方針)。
 */

import type { AnalyticsEngineDataset } from "../types/env.js";
import type { LicenseSku, LicensedApi } from "../types/license.js";
import { SKU_ENTITLED_APIS } from "../types/license.js";
import { SKUS, PRICING_PAGE_URL, PROCUREMENT_DOCS_URL } from "../pricing/quote.js";
import { QUOTE_ENDPOINT_URL } from "./surface.js";

/** AE 上で license self-issue intent イベントを識別する index marker。 */
export const LICENSE_SELF_ISSUE_INTENT_INDEX = "license_self_issue_intent";

/** license self-issue が受理する SKU の集合(per_request は license 契約でないため不可)。 */
export const SELF_ISSUE_SKUS: readonly LicenseSku[] = [
  "address_managed",
  "hub_pro",
  "hub_enterprise",
];

/** 指定値が self-issue 可能な LicenseSku か判定する(純粋関数、runtime 入力の絞り込み)。 */
export function isSelfIssueSku(value: unknown): value is LicenseSku {
  return typeof value === "string" && (SELF_ISSUE_SKUS as readonly string[]).includes(value);
}

/**
 * self-issue intent の処理段階。
 * - checkout_required: 受理。active 化には checkout 完了が必要(skeleton では常にこれ)。
 */
export type SelfIssueStatus = "checkout_required";

/**
 * self-issue intent のレスポンス(§5、AI 可読 JSON)。
 *
 * license は即時発行されない。AI エージェントが次の一手(checkout)を 1 hop で辿れるよう、
 * 価格・entitlement・調達導線・利用可否を構造化して返す。
 */
export interface LicenseSelfIssueIntent {
  /** 処理段階(skeleton では常に "checkout_required")。 */
  status: SelfIssueStatus;
  /** initiate 対象 SKU。 */
  sku: LicenseSku;
  /** 表示名(SKUS 由来)。 */
  skuName: string;
  /** 月額(円、flat)。 */
  monthlyPriceJpy: number;
  /** この license が横断利用を許可する API 群(SKU 由来)。 */
  entitledApis: readonly LicensedApi[];
  /** 含まれる権利(稟議用、SKUS 由来)。 */
  entitlements: readonly string[];
  /**
   * self-serve 調達の利用可否。flat license の Checkout は 2026-06-09 に #19 Stripe part が
   * 本番開通したため "available_now"(quote.ts / surface.ts と同一の honest フラグ)。
   */
  availability: "available_now";
  /** AI エージェント向けの次手説明(active 化は checkout 完了が必要)。 */
  nextStep: string;
  /** 調達開始 URL(透明価格ページの当該 SKU)。 */
  checkoutUrl: string;
  /** 法務・調達文書(稟議用)。 */
  procurementDocsUrl: string;
  /** 完全な見積を取得する endpoint(SKU 選定の根拠確認用)。 */
  quoteUrl: string;
}

/**
 * SKU から self-issue intent を組み立てる(純粋関数、KV 書込・key 発行はしない)。
 *
 * 実際の license key 発行と active 化は #19 Stripe part の Checkout 完了 webhook が担う。
 *
 * @param sku 受理済みの LicenseSku(呼出側で isSelfIssueSku 検証済み想定)
 * @returns self-issue intent(checkout 導線を同梱)
 */
export function buildSelfIssueIntent(sku: LicenseSku): LicenseSelfIssueIntent {
  const def = SKUS[sku];
  return {
    status: "checkout_required",
    sku,
    skuName: def.name,
    // SKUS の license SKU は monthlyPriceJpy を必ず持つ(per_request のみ null、ここには来ない)。
    monthlyPriceJpy: def.monthlyPriceJpy ?? 0,
    entitledApis: SKU_ENTITLED_APIS[sku],
    entitlements: def.entitlements,
    availability: "available_now",
    nextStep:
      "License is not issued until checkout is completed. Self-serve checkout is live: POST /api/v1/licenses/checkout with {\"sku\":\"<this sku>\",\"email\":\"<your email>\"} to receive a Stripe Checkout URL, then complete payment to activate. checkout_url (pricing page) and procurement_docs_url are also available for review.",
    checkoutUrl: `${PRICING_PAGE_URL}#${sku}`,
    procurementDocsUrl: PROCUREMENT_DOCS_URL,
    quoteUrl: QUOTE_ENDPOINT_URL,
  };
}

/**
 * self-issue intent を route レスポンス JSON(snake_case)に整形する。
 *
 * @param intent self-issue intent
 * @returns snake_case の plain object
 */
export function selfIssueIntentToJson(intent: LicenseSelfIssueIntent): Record<string, unknown> {
  return {
    status: intent.status,
    sku: intent.sku,
    sku_name: intent.skuName,
    monthly_price_jpy: intent.monthlyPriceJpy,
    entitled_apis: intent.entitledApis,
    entitlements: intent.entitlements,
    availability: intent.availability,
    next_step: intent.nextStep,
    checkout_url: intent.checkoutUrl,
    procurement_docs_url: intent.procurementDocsUrl,
    quote_url: intent.quoteUrl,
  };
}

/**
 * license self-issue intent イベントを Analytics Engine に記録する(funnel ④ initiation 段、§6)。
 *
 * PII 非保持(email・customer_id・生 license key は書かない)。surface(§3)→ quote → checkout
 * → paid の funnel に「intent(initiation)」段を足す。失敗はレスポンスに影響させない。
 *
 * blobs:
 *   0: イベント種別  "license_self_issue_intent"
 *   1: SKU          address_managed / hub_pro / hub_enterprise
 *   2: 利用可否      available_now
 * doubles:
 *   0: entitled API 数
 *   1: 月額(円)
 * indexes: ["license_self_issue_intent"]
 *
 * @param dataset Analytics Engine binding(未設定ならスキップ)
 * @param intent 記録する intent(PII を含まない)
 */
export function emitLicenseSelfIssueIntentSignal(
  dataset: AnalyticsEngineDataset | undefined,
  intent: LicenseSelfIssueIntent
): void {
  if (!dataset || typeof dataset.writeDataPoint !== "function") return;
  try {
    dataset.writeDataPoint({
      blobs: [LICENSE_SELF_ISSUE_INTENT_INDEX, intent.sku, intent.availability],
      doubles: [intent.entitledApis.length, intent.monthlyPriceJpy],
      indexes: [LICENSE_SELF_ISSUE_INTENT_INDEX],
    });
  } catch (err) {
    // 計測失敗はユーザーに影響させない(surface.ts と同方針)。
    console.error("[license-self-issue] writeDataPoint failed", err);
  }
}
