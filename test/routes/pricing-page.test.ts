import { describe, it, expect } from "vitest";
import { renderPricingPage } from "../../src/pages/pricing.js";

describe("renderPricingPage", () => {
  const html = renderPricingPage();

  it("3 license SKU の確定価格を掲載", () => {
    expect(html).toContain("¥40,000");
    expect(html).toContain("¥120,000");
    expect(html).toContain("¥280,000");
    expect(html).toContain("Shirabe Address Managed");
    expect(html).toContain("Shirabe Hub Pro");
    expect(html).toContain("Shirabe Hub Enterprise");
  });

  it("即時自動見積 endpoint への curl 例を含む", () => {
    expect(html).toContain("https://shirabe.dev/api/v1/pricing/quote");
    expect(html).toContain("apis=address,text");
  });

  it("調達・法務文書へのリンクを含む", () => {
    expect(html).toContain('href="/legal"');
    expect(html).toContain('href="/terms"');
  });

  it("従量(per-request)との比較 + break-even を提示", () => {
    expect(html).toContain("per-request");
    expect(html).toContain("break-even");
    expect(html).toContain('href="/upgrade"');
  });

  it("OfferCatalog JSON-LD を埋め込む(AI が価格取得可能)", () => {
    expect(html).toContain('"@type":"OfferCatalog"');
    expect(html).toContain('"priceCurrency":"JPY"');
  });

  it("canonical は /pricing", () => {
    expect(html).toContain('href="https://shirabe.dev/pricing"');
  });

  it("MCP への言及を含まない(撤退済みと整合)", () => {
    expect(html.toLowerCase()).not.toContain("mcp");
  });
});
