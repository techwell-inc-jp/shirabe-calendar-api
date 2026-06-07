/**
 * Hub license Stripe Checkout ヘルパのテスト(#19 Stripe part)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getLicensePriceId,
  createLicenseCheckoutSession,
  putLicensePending,
  getLicensePending,
  emitLicenseCheckoutInitiatedSignal,
  licensePendingKvKey,
  licenseStripeReverseKvKey,
  LICENSE_PENDING_PREFIX,
  LICENSE_CHECKOUT_INITIATED_INDEX,
} from "../../src/licensing/license-checkout.js";
import type { Env } from "../../src/types/env.js";
import { MockKV } from "../helpers/mock-kv.js";

function envWithPrices(overrides: Partial<Env> = {}): Env {
  return {
    STRIPE_PRICE_ADDRESS_MANAGED: "price_addr",
    STRIPE_PRICE_HUB_PRO: "price_pro",
    STRIPE_PRICE_HUB_ENTERPRISE: "price_ent",
    ...overrides,
  } as unknown as Env;
}

describe("getLicensePriceId", () => {
  it("SKU ごとに対応する Price ID を返す", () => {
    const env = envWithPrices();
    expect(getLicensePriceId("address_managed", env)).toBe("price_addr");
    expect(getLicensePriceId("hub_pro", env)).toBe("price_pro");
    expect(getLicensePriceId("hub_enterprise", env)).toBe("price_ent");
  });

  it("未設定の SKU は undefined", () => {
    const env = envWithPrices({ STRIPE_PRICE_HUB_PRO: undefined });
    expect(getLicensePriceId("hub_pro", env)).toBeUndefined();
  });
});

describe("KV key helpers", () => {
  it("licensePendingKvKey は prefix を付ける", () => {
    expect(licensePendingKvKey("abc")).toBe(`${LICENSE_PENDING_PREFIX}abc`);
  });
  it("licenseStripeReverseKvKey は prefix を付ける", () => {
    expect(licenseStripeReverseKvKey("cus_1")).toBe("license-stripe-reverse:cus_1");
  });
});

describe("createLicenseCheckoutSession", () => {
  afterEach(() => vi.restoreAllMocks());

  it("flat subscription の正しいパラメータで Stripe を呼び url を返す", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_lic" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { url } = await createLicenseCheckoutSession({
      priceId: "price_pro",
      licenseKeyHash: "deadbeefhash",
      sku: "hub_pro",
      email: "ops@example.com",
      stripeSecretKey: "sk_test_x",
    });

    expect(url).toBe("https://checkout.stripe.com/c/pay/cs_lic");
    const [reqUrl, options] = fetchSpy.mock.calls[0];
    expect(reqUrl).toBe("https://api.stripe.com/v1/checkout/sessions");
    const body = options.body as string;
    expect(body).toContain("mode=subscription");
    expect(body).toContain(encodeURIComponent("price_pro"));
    // flat sub なので quantity=1(metered と異なる)
    expect(body).toContain("line_items%5B0%5D%5Bquantity%5D=1");
    expect(body).toContain("metadata%5Bkind%5D=license");
    expect(body).toContain("metadata%5BlicenseKeyHash%5D=deadbeefhash");
    expect(body).toContain("metadata%5Bsku%5D=hub_pro");
    expect(body).toContain("customer_email=ops%40example.com");
    expect(body).toContain(encodeURIComponent("/licenses/checkout/success"));
  });

  it("Stripe が non-ok を返したら throw する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad", { status: 400 }))
    );
    await expect(
      createLicenseCheckoutSession({
        priceId: "price_pro",
        licenseKeyHash: "h",
        sku: "hub_pro",
        email: "a@b.co",
        stripeSecretKey: "sk",
      })
    ).rejects.toThrow(/Stripe API error \(400\)/);
  });
});

describe("license-pending KV round trip", () => {
  it("put → get で同じ値が返る", async () => {
    const kv = new MockKV() as unknown as KVNamespace;
    await putLicensePending(kv, "hash1", {
      licenseKey: "shrb_lic_" + "a".repeat(32),
      sku: "hub_pro",
      email: "ops@example.com",
    });
    const got = await getLicensePending(kv, "hash1");
    expect(got?.licenseKey).toMatch(/^shrb_lic_/);
    expect(got?.sku).toBe("hub_pro");
    expect(got?.email).toBe("ops@example.com");
  });

  it("未存在は null", async () => {
    const kv = new MockKV() as unknown as KVNamespace;
    expect(await getLicensePending(kv, "missing")).toBeNull();
  });

  it("JSON 不正は null", async () => {
    const kv = new MockKV() as unknown as KVNamespace;
    await (kv as unknown as MockKV).put(licensePendingKvKey("broken"), "{ not json");
    expect(await getLicensePending(kv, "broken")).toBeNull();
  });
});

describe("emitLicenseCheckoutInitiatedSignal", () => {
  it("SKU と月額を AE に記録する(PII / 生 key なし)", () => {
    const points: any[] = [];
    const dataset = { writeDataPoint: (p: any) => points.push(p) };
    emitLicenseCheckoutInitiatedSignal(dataset, "hub_pro", 120_000);
    expect(points.length).toBe(1);
    expect(points[0].blobs).toEqual([LICENSE_CHECKOUT_INITIATED_INDEX, "hub_pro"]);
    expect(points[0].doubles).toEqual([120_000]);
    expect(points[0].indexes).toEqual([LICENSE_CHECKOUT_INITIATED_INDEX]);
  });

  it("dataset 未設定なら no-op(throw しない)", () => {
    expect(() => emitLicenseCheckoutInitiatedSignal(undefined, "hub_pro", 1)).not.toThrow();
  });
});
