/**
 * License surface 判定 + AE signal のテスト(#19 backend 非 Stripe 部、設計A)
 */
import { describe, it, expect } from "vitest";
import {
  decideLicenseSurface,
  emitLicenseSurfaceSignal,
  licenseRecommendationToJson,
  paidApisFromStoredKey,
  LICENSE_SURFACE_INDEX,
  QUOTE_ENDPOINT_URL,
} from "../../src/licensing/surface.js";
import type {
  AggregatedApiKeyInfo,
  LegacyApiKeyInfo,
} from "../../src/types/api-key.js";
import { MockAnalyticsEngine } from "../helpers/mock-kv.js";

describe("decideLicenseSurface", () => {
  it("少量・単一 API は per_request 相当のため surface しない(過剰提示回避)", () => {
    const rec = decideLicenseSurface({
      apiContext: "calendar",
      paidApis: [],
      monthlyVolume: 10_000,
    });
    expect(rec).toBeNull();
  });

  it("cross-API(2 API 以上)は Hub Pro を提示する", () => {
    const rec = decideLicenseSurface({
      apiContext: "calendar",
      paidApis: ["address", "text"],
      monthlyVolume: 1_000,
    });
    expect(rec).not.toBeNull();
    expect(rec!.sku).toBe("hub_pro");
    expect(rec!.quote_url).toBe(QUOTE_ENDPOINT_URL);
    expect(rec!.checkout_url).toContain("#hub_pro");
    expect(rec!.availability).toBe("self_serve_opening_2026_06");
  });

  it("単一 API でも break-even 以上の高 volume は Hub Pro を提示する", () => {
    const rec = decideLicenseSurface({
      apiContext: "calendar",
      paidApis: [],
      monthlyVolume: 500_000, // >= Hub Pro break-even 400,000
    });
    expect(rec!.sku).toBe("hub_pro");
  });

  it("住所単体の中規模 volume は Address Managed を提示する", () => {
    const rec = decideLicenseSurface({
      apiContext: "address",
      paidApis: ["address"],
      monthlyVolume: 200_000, // 133,333 <= v < 400,000
    });
    expect(rec!.sku).toBe("address_managed");
  });

  it("超大規模 volume は Hub Enterprise を提示する", () => {
    const rec = decideLicenseSurface({
      apiContext: "calendar",
      paidApis: [],
      monthlyVolume: 1_200_000, // >= 1,000,000
    });
    expect(rec!.sku).toBe("hub_enterprise");
  });

  it("apiContext を母集団に必ず含める(paidApis に無くても)", () => {
    // paidApis=["address"] + apiContext="calendar" → 2 API → Hub Pro
    const rec = decideLicenseSurface({
      apiContext: "calendar",
      paidApis: ["address"],
      monthlyVolume: 1_000,
    });
    expect(rec!.sku).toBe("hub_pro");
  });

  it("不正な volume(NaN)でも throw せず null/SKU を返す", () => {
    const rec = decideLicenseSurface({
      apiContext: "calendar",
      paidApis: [],
      monthlyVolume: Number.NaN,
    });
    expect(rec).toBeNull();
  });
});

describe("paidApisFromStoredKey", () => {
  it("新フォーマット: 非 Free・active のみ抽出(KNOWN_APIS 順)", () => {
    const stored: AggregatedApiKeyInfo = {
      customerId: "org_1",
      createdAt: "2026-06-01T00:00:00.000Z",
      apis: {
        calendar: { plan: "starter" },
        address: { plan: "pro" },
        text: { plan: "free" },
      },
    };
    expect(paidApisFromStoredKey(stored)).toEqual(["address", "calendar"]);
  });

  it("suspended は除外する", () => {
    const stored: AggregatedApiKeyInfo = {
      customerId: "org_2",
      createdAt: "2026-06-01T00:00:00.000Z",
      apis: {
        address: { plan: "pro", status: "suspended" },
        calendar: { plan: "starter", status: "active" },
      },
    };
    expect(paidApisFromStoredKey(stored)).toEqual(["calendar"]);
  });

  it("旧フォーマット(有償)は calendar として扱う", () => {
    const legacy: LegacyApiKeyInfo = {
      plan: "starter",
      customerId: "org_3",
      createdAt: "2026-06-01T00:00:00.000Z",
    };
    expect(paidApisFromStoredKey(legacy)).toEqual(["calendar"]);
  });

  it("旧フォーマット(Free)は空", () => {
    const legacy: LegacyApiKeyInfo = {
      plan: "free",
      customerId: "org_4",
      createdAt: "2026-06-01T00:00:00.000Z",
    };
    expect(paidApisFromStoredKey(legacy)).toEqual([]);
  });
});

describe("emitLicenseSurfaceSignal", () => {
  it("AE に PII なしの surface signal を記録する", () => {
    const ae = new MockAnalyticsEngine();
    emitLicenseSurfaceSignal(ae, {
      sku: "hub_pro",
      apiContext: "calendar",
      plan: "pro",
      paidApiCount: 2,
      monthlyVolume: 500_000,
    });
    expect(ae.points).toHaveLength(1);
    const p = ae.points[0];
    expect(p.blobs).toEqual([LICENSE_SURFACE_INDEX, "hub_pro", "calendar", "pro"]);
    expect(p.doubles).toEqual([2, 500_000]);
    expect(p.indexes).toEqual([LICENSE_SURFACE_INDEX]);
    // PII(key/email/customerId)は blobs に含まれない
    expect(p.blobs!.join("|")).not.toContain("@");
  });

  it("dataset 未設定なら何もしない(throw しない)", () => {
    expect(() =>
      emitLicenseSurfaceSignal(undefined, {
        sku: "hub_pro",
        apiContext: "calendar",
        plan: "pro",
        paidApiCount: 2,
        monthlyVolume: 1,
      })
    ).not.toThrow();
  });

  it("AE 書込が throw してもユーザーに伝播させない", () => {
    const ae = new MockAnalyticsEngine();
    ae.throwOnWrite = true;
    expect(() =>
      emitLicenseSurfaceSignal(ae, {
        sku: "hub_pro",
        apiContext: "calendar",
        plan: "pro",
        paidApiCount: 2,
        monthlyVolume: 1,
      })
    ).not.toThrow();
  });
});

describe("licenseRecommendationToJson", () => {
  it("snake_case の plain object を返す", () => {
    const rec = decideLicenseSurface({
      apiContext: "calendar",
      paidApis: ["address", "text"],
      monthlyVolume: 1_000,
    })!;
    const json = licenseRecommendationToJson(rec);
    expect(Object.keys(json).sort()).toEqual(
      ["availability", "checkout_url", "procurement_docs_url", "quote_url", "reason", "sku"].sort()
    );
    expect(json.sku).toBe("hub_pro");
  });
});
