/**
 * License self-issue intent ロジック + AE signal のテスト(#19 backend 非 Stripe 部、skeleton)
 */
import { describe, it, expect } from "vitest";
import {
  isSelfIssueSku,
  buildSelfIssueIntent,
  selfIssueIntentToJson,
  emitLicenseSelfIssueIntentSignal,
  SELF_ISSUE_SKUS,
  LICENSE_SELF_ISSUE_INTENT_INDEX,
} from "../../src/licensing/self-issue.js";
import { SKU_ENTITLED_APIS } from "../../src/types/license.js";
import { MockAnalyticsEngine } from "../helpers/mock-kv.js";

describe("isSelfIssueSku", () => {
  it("3 つの license SKU のみ true", () => {
    expect(isSelfIssueSku("address_managed")).toBe(true);
    expect(isSelfIssueSku("hub_pro")).toBe(true);
    expect(isSelfIssueSku("hub_enterprise")).toBe(true);
  });

  it("per_request / 未知値 / 非文字列は false", () => {
    expect(isSelfIssueSku("per_request")).toBe(false);
    expect(isSelfIssueSku("bogus")).toBe(false);
    expect(isSelfIssueSku(undefined)).toBe(false);
    expect(isSelfIssueSku(123)).toBe(false);
  });

  it("SELF_ISSUE_SKUS は per_request を含まない", () => {
    expect(SELF_ISSUE_SKUS).not.toContain("per_request" as never);
    expect(SELF_ISSUE_SKUS.length).toBe(3);
  });
});

describe("buildSelfIssueIntent", () => {
  it("hub_pro は 4 API entitlement + ¥120,000 + checkout_required を返す", () => {
    const intent = buildSelfIssueIntent("hub_pro");
    expect(intent.status).toBe("checkout_required");
    expect(intent.sku).toBe("hub_pro");
    expect(intent.monthlyPriceJpy).toBe(120_000);
    expect(intent.entitledApis).toEqual(SKU_ENTITLED_APIS.hub_pro);
    expect(intent.entitledApis.length).toBe(4);
    expect(intent.availability).toBe("self_serve_opening_2026_06");
    expect(intent.entitlements.length).toBeGreaterThan(0);
  });

  it("address_managed は address 単体 entitlement + ¥40,000", () => {
    const intent = buildSelfIssueIntent("address_managed");
    expect(intent.monthlyPriceJpy).toBe(40_000);
    expect(intent.entitledApis).toEqual(["address"]);
  });

  it("checkout_url は SKU アンカー付き透明価格ページ、導線 URL が揃う", () => {
    const intent = buildSelfIssueIntent("hub_enterprise");
    expect(intent.monthlyPriceJpy).toBe(280_000);
    expect(intent.checkoutUrl).toBe("https://shirabe.dev/pricing#hub_enterprise");
    expect(intent.procurementDocsUrl).toBe("https://shirabe.dev/legal");
    expect(intent.quoteUrl).toBe("https://shirabe.dev/api/v1/pricing/quote");
  });
});

describe("selfIssueIntentToJson", () => {
  it("snake_case に整形し PII を含まない", () => {
    const json = selfIssueIntentToJson(buildSelfIssueIntent("hub_pro"));
    expect(json.status).toBe("checkout_required");
    expect(json.sku).toBe("hub_pro");
    expect(json.monthly_price_jpy).toBe(120_000);
    expect(json.entitled_apis).toEqual(SKU_ENTITLED_APIS.hub_pro);
    expect(json.checkout_url).toContain("/pricing#hub_pro");
    expect(json.quote_url).toBe("https://shirabe.dev/api/v1/pricing/quote");
    // email / customer_id / stripe 系は intent に存在しない(PII 最小化)
    expect(json.email).toBeUndefined();
    expect(json.customer_id).toBeUndefined();
  });
});

describe("emitLicenseSelfIssueIntentSignal", () => {
  it("AE に intent イベントを 1 件記録する(blob に SKU、PII なし)", () => {
    const ae = new MockAnalyticsEngine();
    emitLicenseSelfIssueIntentSignal(ae as never, buildSelfIssueIntent("hub_pro"));
    expect(ae.points.length).toBe(1);
    const p = ae.points[0];
    expect(p.blobs?.[0]).toBe(LICENSE_SELF_ISSUE_INTENT_INDEX);
    expect(p.blobs?.[1]).toBe("hub_pro");
    expect(p.indexes).toEqual([LICENSE_SELF_ISSUE_INTENT_INDEX]);
    expect(p.doubles?.[0]).toBe(4); // entitled API 数
    expect(p.doubles?.[1]).toBe(120_000);
  });

  it("dataset 未設定なら no-op(throw しない)", () => {
    expect(() => emitLicenseSelfIssueIntentSignal(undefined, buildSelfIssueIntent("hub_pro"))).not.toThrow();
  });

  it("AE write 失敗はレスポンスに影響させない(握りつぶす)", () => {
    const ae = new MockAnalyticsEngine();
    ae.throwOnWrite = true;
    expect(() => emitLicenseSelfIssueIntentSignal(ae as never, buildSelfIssueIntent("hub_pro"))).not.toThrow();
  });
});
