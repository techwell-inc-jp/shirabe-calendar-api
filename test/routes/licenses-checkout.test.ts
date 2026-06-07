/**
 * POST /api/v1/licenses/checkout の統合テスト(#19 Stripe part)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { licenses } from "../../src/routes/licenses.js";
import type { AppEnv } from "../../src/types/env.js";
import { createMockEnv } from "../helpers/mock-kv.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function createLicenseEnv() {
  const env = createMockEnv();
  return {
    ...env,
    STRIPE_SECRET_KEY: "sk_test_fake",
    STRIPE_PRICE_ADDRESS_MANAGED: "price_addr_test",
    STRIPE_PRICE_HUB_PRO: "price_pro_test",
    STRIPE_PRICE_HUB_ENTERPRISE: "price_ent_test",
  };
}

function makeApp() {
  const app = new Hono<AppEnv>();
  app.route("/api/v1/licenses", licenses);
  return app;
}

function post(body: unknown) {
  return new Request("http://localhost/api/v1/licenses/checkout", {
    method: "POST",
    headers: JSON_HEADERS,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/v1/licenses/checkout", () => {
  let env: ReturnType<typeof createLicenseEnv>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    env = createLicenseEnv();
    fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_lic_xxx" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => vi.restoreAllMocks());

  it("正常系: checkout_url + pending 保存 + flat sub パラメータ + AE signal", async () => {
    const res = await makeApp().fetch(post({ sku: "hub_pro", email: "ops@example.com" }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { checkout_url: string };
    expect(body.checkout_url).toBe("https://checkout.stripe.com/c/pay/cs_lic_xxx");

    // Stripe へ flat sub + license metadata
    const sent = fetchSpy.mock.calls[0][1].body as string;
    expect(sent).toContain("mode=subscription");
    expect(sent).toContain(encodeURIComponent("price_pro_test"));
    expect(sent).toContain("line_items%5B0%5D%5Bquantity%5D=1");
    expect(sent).toContain("metadata%5Bkind%5D=license");

    // license-pending が保存される(license key 平文 + sku + email)
    const keys = await env.USAGE_LOGS.list({ prefix: "license-pending:" });
    expect(keys.keys.length).toBe(1);
    const pending = JSON.parse((await env.USAGE_LOGS.get(keys.keys[0].name))!);
    expect(pending.licenseKey).toMatch(/^shrb_lic_[A-Za-z0-9]{32}$/);
    expect(pending.sku).toBe("hub_pro");
    expect(pending.email).toBe("ops@example.com");

    // AE に checkout_initiated signal(PII なし)
    expect(env.ANALYTICS.points.length).toBe(1);
    expect(env.ANALYTICS.points[0].blobs?.[0]).toBe("license_checkout_initiated");
    expect(env.ANALYTICS.points[0].blobs?.[1]).toBe("hub_pro");
    expect(JSON.stringify(env.ANALYTICS.points[0])).not.toContain("ops@example.com");
  });

  it("license key hash が pending key と session metadata で一致する", async () => {
    await makeApp().fetch(post({ sku: "address_managed", email: "a@b.co" }), env);
    const keys = await env.USAGE_LOGS.list({ prefix: "license-pending:" });
    const hashFromKey = keys.keys[0].name.replace("license-pending:", "");
    const sent = fetchSpy.mock.calls[0][1].body as string;
    expect(sent).toContain(`metadata%5BlicenseKeyHash%5D=${hashFromKey}`);
  });

  it("不正な SKU は 400 INVALID_SKU", async () => {
    const res = await makeApp().fetch(post({ sku: "per_request", email: "a@b.co" }), env);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe("INVALID_SKU");
  });

  it("email 欠落は 400 INVALID_EMAIL", async () => {
    const res = await makeApp().fetch(post({ sku: "hub_pro" }), env);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe("INVALID_EMAIL");
  });

  it("不正な JSON は 400 INVALID_BODY", async () => {
    const res = await makeApp().fetch(post("{ not json"), env);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe("INVALID_BODY");
  });

  it("Price ID 未設定の SKU は 503 SKU_NOT_PURCHASABLE", async () => {
    const noPrice = { ...env, STRIPE_PRICE_HUB_PRO: undefined };
    const res = await makeApp().fetch(post({ sku: "hub_pro", email: "a@b.co" }), noPrice);
    expect(res.status).toBe(503);
    expect(((await res.json()) as any).error.code).toBe("SKU_NOT_PURCHASABLE");
  });

  it("STRIPE_SECRET_KEY 未設定は 500", async () => {
    const noSecret = { ...env, STRIPE_SECRET_KEY: undefined };
    const res = await makeApp().fetch(post({ sku: "hub_pro", email: "a@b.co" }), noSecret);
    expect(res.status).toBe(500);
  });

  it("Stripe エラーは 502 CHECKOUT_FAILED + pending を残さない", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("err", { status: 400 }));
    const res = await makeApp().fetch(post({ sku: "hub_enterprise", email: "a@b.co" }), env);
    expect(res.status).toBe(502);
    expect(((await res.json()) as any).error.code).toBe("CHECKOUT_FAILED");
    const keys = await env.USAGE_LOGS.list({ prefix: "license-pending:" });
    expect(keys.keys.length).toBe(0);
  });
});
