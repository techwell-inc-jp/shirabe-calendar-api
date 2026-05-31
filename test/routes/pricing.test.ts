import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { pricing } from "../../src/routes/pricing.js";
import type { AppEnv } from "../../src/types/env.js";

function makeApp() {
  const app = new Hono<AppEnv>();
  app.route("/api/v1/pricing", pricing);
  return app;
}

describe("GET /api/v1/pricing/quote", () => {
  it("cross-API(address,text)→ hub_pro を 200 で返す", async () => {
    const res = await makeApp().request("/api/v1/pricing/quote?apis=address,text&volume=5000");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.recommended_sku).toBe("hub_pro");
    expect(body.monthly_price_jpy).toBe(120_000);
    expect(body.checkout_url).toContain("/pricing");
    expect(body.procurement_docs_url).toBe("https://shirabe.dev/legal");
  });

  it("住所単体 high volume → address_managed", async () => {
    const res = await makeApp().request("/api/v1/pricing/quote?apis=address&volume=200000");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.recommended_sku).toBe("address_managed");
    expect(body.monthly_price_jpy).toBe(40_000);
  });

  it("少量単体 → per_request(過剰提示しない)", async () => {
    const res = await makeApp().request("/api/v1/pricing/quote?apis=address&volume=1000");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.recommended_sku).toBe("per_request");
    expect(body.monthly_price_jpy).toBeNull();
  });

  it("sla=1 で単体でも hub_pro", async () => {
    const res = await makeApp().request("/api/v1/pricing/quote?apis=address&volume=1000&sla=1");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.recommended_sku).toBe("hub_pro");
  });

  it("apis 省略でも 200(per_request)", async () => {
    const res = await makeApp().request("/api/v1/pricing/quote?volume=1000");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.recommended_sku).toBe("per_request");
  });

  it("不正な volume は 400", async () => {
    const res = await makeApp().request("/api/v1/pricing/quote?apis=address&volume=abc");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("INVALID_PARAMETER");
  });

  it("未知の API 名は無視される", async () => {
    const res = await makeApp().request("/api/v1/pricing/quote?apis=address,bogus&volume=5000");
    const body = (await res.json()) as Record<string, unknown>;
    // address のみ(少量)→ per_request
    expect(body.recommended_sku).toBe("per_request");
  });
});

describe("POST /api/v1/pricing/quote", () => {
  it("JSON body で住所単体 high volume → address_managed", async () => {
    const res = await makeApp().request("/api/v1/pricing/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apis: ["address"], est_monthly_volume: 200_000 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.recommended_sku).toBe("address_managed");
  });

  it("need_dataset:true → hub_enterprise", async () => {
    const res = await makeApp().request("/api/v1/pricing/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apis: ["address"], est_monthly_volume: 5000, need_dataset: true }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.recommended_sku).toBe("hub_enterprise");
    expect(body.monthly_price_jpy).toBe(280_000);
  });

  it("不正な JSON body は 400", async () => {
    const res = await makeApp().request("/api/v1/pricing/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("INVALID_BODY");
  });

  it("est_monthly_volume 欠落は 400", async () => {
    const res = await makeApp().request("/api/v1/pricing/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apis: ["address"] }),
    });
    expect(res.status).toBe(400);
  });
});
