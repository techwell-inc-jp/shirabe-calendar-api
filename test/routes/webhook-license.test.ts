/**
 * Stripe Webhook の Hub license 処理テスト(#19 Stripe part)
 *
 * - checkout.session.completed(kind=license)→ license 発行 + active + 逆引き登録
 * - invoice.payment_failed → suspended
 * - invoice.payment_succeeded → suspended から active 復帰
 * - customer.subscription.deleted → suspended
 * - per-request key の checkout(kind なし)は license path に入らない(回帰)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { webhook } from "../../src/routes/webhook.js";
import type { AppEnv } from "../../src/types/env.js";
import { createMockEnv } from "../helpers/mock-kv.js";
import { generateLicenseKey, getLicense } from "../../src/licensing/license-store.js";
import { licenseStripeReverseKvKey, licensePendingKvKey } from "../../src/licensing/license-checkout.js";
import { sha256Hex } from "../../src/util/sha256.js";

const WEBHOOK_SECRET = "whsec_test_secret_for_testing";

function createWebhookEnv() {
  const env = createMockEnv();
  return { ...env, STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET };
}

async function signPayload(payload: string, secret: string, timestamp?: number): Promise<string> {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${ts}.${payload}`));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${ts},v1=${hex}`;
}

function makeApp() {
  const app = new Hono<AppEnv>();
  app.route("/webhook/stripe", webhook);
  return app;
}

async function sendWebhook(app: Hono<AppEnv>, env: ReturnType<typeof createWebhookEnv>, event: any) {
  const body = JSON.stringify(event);
  const sigHeader = await signPayload(body, WEBHOOK_SECRET);
  return app.fetch(
    new Request("http://localhost/webhook/stripe", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": sigHeader },
      body,
    }),
    env
  );
}

/** license-pending を仕込み、(licenseKey, hash)を返す。 */
async function seedPending(
  env: ReturnType<typeof createWebhookEnv>,
  sku: string,
  email: string
): Promise<{ licenseKey: string; hash: string }> {
  const licenseKey = generateLicenseKey();
  const hash = await sha256Hex(licenseKey);
  await env.USAGE_LOGS.put(
    licensePendingKvKey(hash),
    JSON.stringify({ licenseKey, sku, email })
  );
  return { licenseKey, hash };
}

describe("webhook: license checkout.session.completed", () => {
  let app: Hono<AppEnv>;
  let env: ReturnType<typeof createWebhookEnv>;

  beforeEach(() => {
    app = makeApp();
    env = createWebhookEnv();
  });

  it("license を active 発行し、逆引きを登録、pending は残す", async () => {
    const { licenseKey, hash } = await seedPending(env, "hub_pro", "ops@example.com");
    const res = await sendWebhook(app, env, {
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { kind: "license", licenseKeyHash: hash, sku: "hub_pro" },
          customer: "cus_lic_1",
          subscription: "sub_lic_1",
        },
      },
    });
    expect(res.status).toBe(200);

    const license = await getLicense(env.API_KEYS as unknown as KVNamespace, licenseKey);
    expect(license).not.toBeNull();
    expect(license!.status).toBe("active");
    expect(license!.sku).toBe("hub_pro");
    expect(license!.entitledApis).toEqual(["address", "text", "calendar", "corporation"]);
    expect(license!.stripeCustomerId).toBe("cus_lic_1");
    expect(license!.stripeSubscriptionId).toBe("sub_lic_1");

    // 逆引き(customer → license key)
    expect(await env.USAGE_LOGS.get(licenseStripeReverseKvKey("cus_lic_1"))).toBe(licenseKey);
    // pending は success ページのため残す
    expect(await env.USAGE_LOGS.get(licensePendingKvKey(hash))).not.toBeNull();
  });

  it("pending が無い場合は license を発行しない(200 のまま)", async () => {
    const hash = await sha256Hex(generateLicenseKey());
    const res = await sendWebhook(app, env, {
      type: "checkout.session.completed",
      data: { object: { metadata: { kind: "license", licenseKeyHash: hash, sku: "hub_pro" }, customer: "cus_x" } },
    });
    expect(res.status).toBe(200);
    expect(await env.USAGE_LOGS.get(licenseStripeReverseKvKey("cus_x"))).toBeNull();
  });

  it("kind なし(per-request checkout)は license path に入らない", async () => {
    // apiKeyHash metadata はあるが pending 無し → 既存 handler は no-op、license も作られない
    const res = await sendWebhook(app, env, {
      type: "checkout.session.completed",
      data: { object: { metadata: { apiKeyHash: "abc", plan: "starter" }, customer: "cus_pr" } },
    });
    expect(res.status).toBe(200);
    // license 逆引きは作られない
    expect(await env.USAGE_LOGS.get(licenseStripeReverseKvKey("cus_pr"))).toBeNull();
  });
});

describe("webhook: license status transitions", () => {
  let app: Hono<AppEnv>;
  let env: ReturnType<typeof createWebhookEnv>;
  let licenseKey: string;

  beforeEach(async () => {
    app = makeApp();
    env = createWebhookEnv();
    // active license を発行(checkout.session.completed 経由)
    const seeded = await seedPending(env, "hub_pro", "ops@example.com");
    licenseKey = seeded.licenseKey;
    await sendWebhook(app, env, {
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { kind: "license", licenseKeyHash: seeded.hash, sku: "hub_pro" },
          customer: "cus_lic_1",
          subscription: "sub_lic_1",
        },
      },
    });
  });

  it("payment_failed → suspended", async () => {
    await sendWebhook(app, env, {
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_lic_1" } },
    });
    const license = await getLicense(env.API_KEYS as unknown as KVNamespace, licenseKey);
    expect(license!.status).toBe("suspended");
  });

  it("payment_succeeded → suspended から active 復帰", async () => {
    await sendWebhook(app, env, { type: "invoice.payment_failed", data: { object: { customer: "cus_lic_1" } } });
    await sendWebhook(app, env, { type: "invoice.payment_succeeded", data: { object: { customer: "cus_lic_1" } } });
    const license = await getLicense(env.API_KEYS as unknown as KVNamespace, licenseKey);
    expect(license!.status).toBe("active");
  });

  it("subscription.deleted → suspended(entitlement 失効)", async () => {
    await sendWebhook(app, env, {
      type: "customer.subscription.deleted",
      data: { object: { customer: "cus_lic_1" } },
    });
    const license = await getLicense(env.API_KEYS as unknown as KVNamespace, licenseKey);
    expect(license!.status).toBe("suspended");
  });
});
