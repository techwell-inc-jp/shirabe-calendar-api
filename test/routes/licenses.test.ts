/**
 * License self-issue / introspection route の統合テスト(#19 backend 非 Stripe 部、skeleton)
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { licenses } from "../../src/routes/licenses.js";
import type { AppEnv } from "../../src/types/env.js";
import { buildLicense, putLicense, generateLicenseKey } from "../../src/licensing/license-store.js";
import { createMockEnv } from "../helpers/mock-kv.js";

function makeApp() {
  const app = new Hono<AppEnv>();
  app.route("/api/v1/licenses", licenses);
  return app;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

describe("POST /api/v1/licenses/self-issue", () => {
  it("hub_pro → 200 checkout_required + 4 API entitlement", async () => {
    const env = createMockEnv();
    const res = await makeApp().request(
      "/api/v1/licenses/self-issue",
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ sku: "hub_pro" }) },
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("checkout_required");
    expect(body.sku).toBe("hub_pro");
    expect(body.monthly_price_jpy).toBe(120_000);
    expect(body.entitled_apis).toEqual(["address", "text", "calendar", "corporation"]);
    expect(body.availability).toBe("available_now");
    expect(body.checkout_url).toContain("/pricing#hub_pro");
  });

  it("intent は AE に initiation signal を記録する(PII なし)", async () => {
    const env = createMockEnv();
    await makeApp().request(
      "/api/v1/licenses/self-issue",
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ sku: "hub_pro", email: "ops@example.com" }) },
      env
    );
    expect(env.ANALYTICS.points.length).toBe(1);
    const p = env.ANALYTICS.points[0];
    expect(p.blobs?.[1]).toBe("hub_pro");
    // email は AE に書かない
    expect(JSON.stringify(p)).not.toContain("ops@example.com");
  });

  it("address_managed → ¥40,000 + address 単体 entitlement", async () => {
    const res = await makeApp().request(
      "/api/v1/licenses/self-issue",
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ sku: "address_managed" }) },
      createMockEnv()
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.monthly_price_jpy).toBe(40_000);
    expect(body.entitled_apis).toEqual(["address"]);
  });

  it("有効な email は受理して 200", async () => {
    const res = await makeApp().request(
      "/api/v1/licenses/self-issue",
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ sku: "hub_pro", email: "ops@example.com" }) },
      createMockEnv()
    );
    expect(res.status).toBe(200);
  });

  it("license でない SKU(per_request)は 400 INVALID_SKU + allowed list", async () => {
    const res = await makeApp().request(
      "/api/v1/licenses/self-issue",
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ sku: "per_request" }) },
      createMockEnv()
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string; details?: { allowed?: string[] } } };
    expect(body.error?.code).toBe("INVALID_SKU");
    expect(body.error?.details?.allowed).toEqual(["address_managed", "hub_pro", "hub_enterprise"]);
  });

  it("未知の SKU は 400 INVALID_SKU", async () => {
    const res = await makeApp().request(
      "/api/v1/licenses/self-issue",
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ sku: "bogus" }) },
      createMockEnv()
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: { code?: string } }).error?.code).toBe("INVALID_SKU");
  });

  it("不正な email は 400 INVALID_EMAIL", async () => {
    const res = await makeApp().request(
      "/api/v1/licenses/self-issue",
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ sku: "hub_pro", email: "not-an-email" }) },
      createMockEnv()
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: { code?: string } }).error?.code).toBe("INVALID_EMAIL");
  });

  it("不正な JSON body は 400 INVALID_BODY", async () => {
    const res = await makeApp().request(
      "/api/v1/licenses/self-issue",
      { method: "POST", headers: JSON_HEADERS, body: "{ not json" },
      createMockEnv()
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: { code?: string } }).error?.code).toBe("INVALID_BODY");
  });
});

describe("GET /api/v1/licenses/{licenseKey}", () => {
  it("存在する license → 200 公開ビュー(PII 非返却)", async () => {
    const env = createMockEnv();
    const key = generateLicenseKey();
    const license = buildLicense({
      licenseKey: key,
      customerId: "org_demo",
      sku: "hub_pro",
      email: "secret@example.com",
      stripeCustomerId: "cus_secret",
      now: "2026-06-05T00:00:00.000Z",
    });
    await putLicense(env.API_KEYS as unknown as KVNamespace, license, "2026-06-05T00:00:00.000Z");

    const res = await makeApp().request(`/api/v1/licenses/${key}`, {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.license_key).toBe(key);
    expect(body.sku).toBe("hub_pro");
    expect(body.status).toBe("active");
    expect(body.entitled_apis).toEqual(["address", "text", "calendar", "corporation"]);
    // PII / 機密は返さない
    expect(body.email).toBeUndefined();
    expect(body.stripe_customer_id).toBeUndefined();
    expect(body.stripeCustomerId).toBeUndefined();
  });

  it("未発行 / 不明な key は 404", async () => {
    const res = await makeApp().request(`/api/v1/licenses/${generateLicenseKey()}`, {}, createMockEnv());
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error?: { code?: string } }).error?.code).toBe("NOT_FOUND");
  });

  it("形式不正な key も 404(存在/形式を leak しない)", async () => {
    const res = await makeApp().request(`/api/v1/licenses/not-a-license-key`, {}, createMockEnv());
    expect(res.status).toBe(404);
  });
});
