/**
 * Phase 3: Stripe Checkout + APIキー自動発行のテスト
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Hono } from "hono";
import { checkout, generateApiKey, sha256Hex } from "../../src/routes/checkout.js";
import type { AppEnv } from "../../src/types/env.js";
import { createMockEnv } from "../helpers/mock-kv.js";

/**
 * テスト用 env にStripe環境変数を追加して返す
 */
function createCheckoutEnv() {
  const env = createMockEnv();
  return {
    ...env,
    STRIPE_SECRET_KEY: "sk_test_fake_key",
    STRIPE_PRICE_STARTER: "price_starter_test",
    STRIPE_PRICE_PRO: "price_pro_test",
    STRIPE_PRICE_ENTERPRISE: "price_enterprise_test",
  };
}

describe("generateApiKey", () => {
  it("shrb_ + 32文字の英数字で構成される", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^shrb_[a-zA-Z0-9]{32}$/);
  });

  it("生成のたびに異なるキーが返る", () => {
    const k1 = generateApiKey();
    const k2 = generateApiKey();
    expect(k1).not.toBe(k2);
  });
});

describe("sha256Hex", () => {
  it("64文字の16進数文字列を返す", async () => {
    const hash = await sha256Hex("test");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("同じ入力で同じハッシュを返す", async () => {
    const h1 = await sha256Hex("hello");
    const h2 = await sha256Hex("hello");
    expect(h1).toBe(h2);
  });
});

describe("POST /api/v1/checkout", () => {
  let app: Hono<AppEnv>;
  let env: ReturnType<typeof createCheckoutEnv>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    env = createCheckoutEnv();
    app = new Hono<AppEnv>();
    app.route("/api/v1/checkout", checkout);

    // Mock global fetch for Stripe API
    fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_test_xxx" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("正常なリクエストで checkout_url が返る", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", plan: "starter" }),
      }),
      env
    );

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.checkout_url).toBe("https://checkout.stripe.com/c/pay/cs_test_xxx");
  });

  it("Stripe API に正しいパラメータが送られる", async () => {
    await app.fetch(
      new Request("http://localhost/api/v1/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", plan: "pro" }),
      }),
      env
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(options.method).toBe("POST");

    const sentBody = options.body as string;
    expect(sentBody).toContain("mode=subscription");
    expect(sentBody).toContain("customer_email=user%40example.com");
    expect(sentBody).toContain(encodeURIComponent("price_pro_test"));
    expect(sentBody).toContain("metadata%5Bplan%5D=pro");
    expect(sentBody).toContain("metadata%5BapiKeyHash%5D=");
  });

  it("KV checkout-pending にAPIキー情報が保存される", async () => {
    await app.fetch(
      new Request("http://localhost/api/v1/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", plan: "starter" }),
      }),
      env
    );

    // checkout-pending:xxx が書き込まれたか確認
    const keys = await env.USAGE_LOGS.list({ prefix: "checkout-pending:" });
    expect(keys.keys.length).toBe(1);

    const pendingStr = await env.USAGE_LOGS.get(keys.keys[0].name);
    expect(pendingStr).not.toBeNull();
    const pending = JSON.parse(pendingStr!);
    expect(pending.apiKey).toMatch(/^shrb_[a-zA-Z0-9]{32}$/);
    expect(pending.plan).toBe("starter");
    expect(pending.email).toBe("test@example.com");
  });

  it("emailが無ければ400を返す", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "starter" }),
      }),
      env
    );
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("不正なemail形式で400を返す", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", plan: "starter" }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it("planが無ければ400を返す", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it("plan=freeは400を返す（Freeプランは有料Checkoutの対象外）", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", plan: "free" }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it("不正なplan名で400を返す", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", plan: "ultimate" }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it("JSONでないボディで400を返す", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/checkout", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not json",
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it("STRIPE_SECRET_KEYが未設定なら500を返す", async () => {
    const noStripeEnv = { ...env, STRIPE_SECRET_KEY: undefined };
    const res = await app.fetch(
      new Request("http://localhost/api/v1/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", plan: "starter" }),
      }),
      noStripeEnv
    );
    expect(res.status).toBe(500);
  });

  it("Stripe APIがエラーを返した場合502を返す", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Invalid" } }), { status: 400 })
    );

    const res = await app.fetch(
      new Request("http://localhost/api/v1/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", plan: "starter" }),
      }),
      env
    );
    expect(res.status).toBe(502);
    const body: any = await res.json();
    expect(body.error.code).toBe("CHECKOUT_FAILED");
  });

  it("Enterprise プランでも checkout_url が返る", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "ent@example.com", plan: "enterprise" }),
      }),
      env
    );
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.checkout_url).toBeTruthy();
  });
});
