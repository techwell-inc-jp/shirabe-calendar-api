import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { renderOnePager } from "../../src/pages/pricing-one-pager.js";
import { buildOnePagerUrl } from "../../src/pricing/quote.js";
import { pricing, parseQuoteFromQuery } from "../../src/routes/pricing.js";
import type { AppEnv } from "../../src/types/env.js";

/** index.ts と同一の wiring で one-pager route を持つ最小アプリ。 */
function makeOnePagerApp() {
  const app = new Hono<AppEnv>();
  app.get("/pricing/one-pager", (c) => {
    const { input, errorMessage } = parseQuoteFromQuery((k) => c.req.query(k));
    if (!input) return c.text(errorMessage ?? "invalid parameter", 400);
    return c.html(renderOnePager(input));
  });
  return app;
}

function makeQuoteApp() {
  const app = new Hono<AppEnv>();
  app.route("/api/v1/pricing", pricing);
  return app;
}

describe("buildOnePagerUrl", () => {
  it("apis/volume/sla を URL 化、false の dataset は省略", () => {
    const u = new URL(
      buildOnePagerUrl({ apis: ["address", "text"], estMonthlyVolume: 500_000, needSla: true })
    );
    expect(u.origin + u.pathname).toBe("https://shirabe.dev/pricing/one-pager");
    expect(u.searchParams.get("apis")).toBe("address,text");
    expect(u.searchParams.get("volume")).toBe("500000");
    expect(u.searchParams.get("sla")).toBe("1");
    expect(u.searchParams.has("dataset")).toBe(false);
  });

  it("空 apis は apis を省略、volume は常に付与", () => {
    const u = new URL(buildOnePagerUrl({ apis: [], estMonthlyVolume: 1000 }));
    expect(u.searchParams.has("apis")).toBe(false);
    expect(u.searchParams.get("volume")).toBe("1000");
  });

  it("dataset:true で dataset=1 を付与", () => {
    const u = new URL(buildOnePagerUrl({ apis: ["address"], estMonthlyVolume: 5000, needDataset: true }));
    expect(u.searchParams.get("dataset")).toBe("1");
  });
});

describe("renderOnePager", () => {
  it("license(hub_pro): プラン名・確定価格・手順・noindex・印刷ボタン・API ラベル", () => {
    const html = renderOnePager({ apis: ["address", "text"], estMonthlyVolume: 500_000 });
    expect(html).toContain("Shirabe Hub Pro");
    expect(html).toContain("¥120,000");
    expect(html).toContain("契約までの手順");
    expect(html).toContain("住所正規化");
    expect(html).toContain("人名・テキスト処理");
    // パラメータページの index bloat 回避(GSC 事例の再発防止)
    expect(html).toContain('name="robots" content="noindex');
    // forward 先で印刷 / PDF 化できる
    expect(html).toContain("window.print()");
    // availability を正直に(license は 2026-06 開通)
    expect(html).toContain("2026 年 6 月開通");
    // MCP 撤退と整合
    expect(html.toLowerCase()).not.toContain("mcp");
  });

  it("per_request: 従量を提示し license を勧めない + 今すぐ利用開始可", () => {
    const html = renderOnePager({ apis: ["address"], estMonthlyVolume: 1000 });
    expect(html).toContain("従量課金");
    expect(html).toContain("今すぐ利用開始");
    expect(html).not.toContain("¥120,000");
  });

  it("hub_enterprise(dataset 要): 価格と dataset entitlement を提示", () => {
    const html = renderOnePager({ apis: ["address"], estMonthlyVolume: 5000, needDataset: true });
    expect(html).toContain("Shirabe Hub Enterprise");
    expect(html).toContain("¥280,000");
    expect(html).toContain("dataset");
  });
});

describe("GET /pricing/one-pager", () => {
  it("cross-API → 200 + HTML(hub_pro)", async () => {
    const res = await makeOnePagerApp().request("/pricing/one-pager?apis=address,text&volume=500000");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Shirabe Hub Pro");
    expect(html).toContain("導入見積サマリー");
  });

  it("不正な volume は 400", async () => {
    const res = await makeOnePagerApp().request("/pricing/one-pager?apis=address&volume=abc");
    expect(res.status).toBe(400);
  });
});

describe("quote endpoint に one_pager_url が同梱される(funnel ②→③ ブリッジ)", () => {
  it("GET /quote に one-pager を指す one_pager_url が含まれる", async () => {
    const res = await makeQuoteApp().request("/api/v1/pricing/quote?apis=address,text&volume=500000");
    const body = (await res.json()) as Record<string, unknown>;
    expect(String(body.one_pager_url)).toContain("/pricing/one-pager");
    expect(String(body.one_pager_url)).toContain("volume=500000");
  });

  it("POST /quote にも one_pager_url が含まれる", async () => {
    const res = await makeQuoteApp().request("/api/v1/pricing/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apis: ["address"], est_monthly_volume: 5000, need_dataset: true }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(String(body.one_pager_url)).toContain("/pricing/one-pager");
    expect(String(body.one_pager_url)).toContain("dataset=1");
  });
});
