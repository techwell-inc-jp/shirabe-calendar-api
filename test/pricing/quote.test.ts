import { describe, it, expect } from "vitest";
import {
  recommendQuote,
  quoteToJson,
  SKUS,
  ADDRESS_MANAGED_BREAK_EVEN_REQ,
  HUB_PRO_BREAK_EVEN_REQ,
  HUB_ENTERPRISE_VOLUME_THRESHOLD_REQ,
  REFERENCE_PER_REQUEST_RATE_JPY,
  PRICING_PAGE_URL,
  PROCUREMENT_DOCS_URL,
} from "../../src/pricing/quote.js";

describe("pricing constants", () => {
  it("確定価格(#19): 40,000 / 120,000 / 280,000", () => {
    expect(SKUS.address_managed.monthlyPriceJpy).toBe(40_000);
    expect(SKUS.hub_pro.monthlyPriceJpy).toBe(120_000);
    expect(SKUS.hub_enterprise.monthlyPriceJpy).toBe(280_000);
  });

  it("break-even は住所 Pro ¥0.3/req 基準で算出", () => {
    expect(REFERENCE_PER_REQUEST_RATE_JPY).toBe(0.3);
    expect(ADDRESS_MANAGED_BREAK_EVEN_REQ).toBe(Math.round(40_000 / 0.3)); // 133,333
    expect(HUB_PRO_BREAK_EVEN_REQ).toBe(400_000);
    expect(HUB_ENTERPRISE_VOLUME_THRESHOLD_REQ).toBe(1_000_000);
  });
});

describe("recommendQuote — 過剰提示回避(per_request)", () => {
  it("単発少量(住所 1 万 req)は license を勧めず per_request", () => {
    const q = recommendQuote({ apis: ["address"], estMonthlyVolume: 10_000 });
    expect(q.recommendedSku).toBe("per_request");
    expect(q.monthlyPriceJpy).toBeNull();
    expect(q.availability).toBe("available_now");
  });

  it("apis 空 + volume 0 でも安全に per_request", () => {
    const q = recommendQuote({ apis: [], estMonthlyVolume: 0 });
    expect(q.recommendedSku).toBe("per_request");
    expect(q.perRequestEquivalentJpy).toBeNull();
  });

  it("break-even ちょうど未満(住所)は per_request", () => {
    const q = recommendQuote({ apis: ["address"], estMonthlyVolume: ADDRESS_MANAGED_BREAK_EVEN_REQ - 1 });
    expect(q.recommendedSku).toBe("per_request");
  });
});

describe("recommendQuote — Address Managed(住所単体 high volume)", () => {
  it("住所単体 break-even 以上は address_managed", () => {
    const q = recommendQuote({ apis: ["address"], estMonthlyVolume: ADDRESS_MANAGED_BREAK_EVEN_REQ });
    expect(q.recommendedSku).toBe("address_managed");
    expect(q.monthlyPriceJpy).toBe(40_000);
    expect(q.availability).toBe("self_serve_opening_2026_06");
    expect(q.entitlements.length).toBeGreaterThan(0);
  });

  it("per_request_equivalent = 月額 ÷ volume", () => {
    const vol = 200_000;
    const q = recommendQuote({ apis: ["address"], estMonthlyVolume: vol });
    expect(q.recommendedSku).toBe("address_managed");
    expect(q.perRequestEquivalentJpy).toBeCloseTo(40_000 / vol, 4); // ¥0.2/req < ¥0.3 → 有利
    expect(q.perRequestEquivalentJpy!).toBeLessThan(REFERENCE_PER_REQUEST_RATE_JPY);
  });
});

describe("recommendQuote — Hub Pro", () => {
  it("cross-API(2 API)は volume に関わらず hub_pro", () => {
    const q = recommendQuote({ apis: ["address", "text"], estMonthlyVolume: 5_000 });
    expect(q.recommendedSku).toBe("hub_pro");
    expect(q.monthlyPriceJpy).toBe(120_000);
  });

  it("単一 API でも SLA 要なら hub_pro", () => {
    const q = recommendQuote({ apis: ["address"], estMonthlyVolume: 5_000, needSla: true });
    expect(q.recommendedSku).toBe("hub_pro");
  });

  it("単一 API でも Hub Pro break-even 以上なら hub_pro", () => {
    const q = recommendQuote({ apis: ["text"], estMonthlyVolume: HUB_PRO_BREAK_EVEN_REQ });
    expect(q.recommendedSku).toBe("hub_pro");
  });

  it("cross-API は同一 API 重複を数えない(Set 判定)", () => {
    const q = recommendQuote({ apis: ["address", "address"], estMonthlyVolume: 5_000 });
    expect(q.recommendedSku).toBe("per_request"); // 実質 1 API・少量
  });
});

describe("recommendQuote — Hub Enterprise", () => {
  it("dataset 要なら hub_enterprise", () => {
    const q = recommendQuote({ apis: ["address"], estMonthlyVolume: 5_000, needDataset: true });
    expect(q.recommendedSku).toBe("hub_enterprise");
    expect(q.monthlyPriceJpy).toBe(280_000);
  });

  it("超大規模(100 万 req 以上)は hub_enterprise(cross-API 判定より優先)", () => {
    const q = recommendQuote({ apis: ["address", "text"], estMonthlyVolume: HUB_ENTERPRISE_VOLUME_THRESHOLD_REQ });
    expect(q.recommendedSku).toBe("hub_enterprise");
  });
});

describe("recommendQuote — 出力契約", () => {
  it("全 SKU で break_even_note と調達導線を必ず返す", () => {
    const inputs = [
      { apis: ["address"], estMonthlyVolume: 1_000 },
      { apis: ["address"], estMonthlyVolume: 200_000 },
      { apis: ["address", "text"], estMonthlyVolume: 5_000 },
      { apis: ["address"], estMonthlyVolume: 5_000, needDataset: true },
    ] as const;
    for (const input of inputs) {
      const q = recommendQuote(input);
      expect(q.breakEvenNote.length).toBeGreaterThan(0);
      expect(q.checkoutUrl.startsWith(PRICING_PAGE_URL)).toBe(true);
      expect(q.procurementDocsUrl).toBe(PROCUREMENT_DOCS_URL);
    }
  });

  it("負の volume は 0 として扱う(安全)", () => {
    const q = recommendQuote({ apis: ["address"], estMonthlyVolume: -100 });
    expect(q.recommendedSku).toBe("per_request");
    expect(q.perRequestEquivalentJpy).toBeNull();
  });
});

describe("quoteToJson — snake_case 整形", () => {
  it("AI-callable な snake_case フィールドに変換", () => {
    const q = recommendQuote({ apis: ["address", "text"], estMonthlyVolume: 500_000 });
    const json = quoteToJson(q);
    expect(json).toMatchObject({
      recommended_sku: "hub_pro",
      monthly_price_jpy: 120_000,
      checkout_url: expect.any(String),
      procurement_docs_url: PROCUREMENT_DOCS_URL,
      availability: "self_serve_opening_2026_06",
    });
    expect(json).toHaveProperty("per_request_equivalent_jpy");
    expect(json).toHaveProperty("break_even_note");
    expect(Array.isArray(json.entitlements)).toBe(true);
  });
});
