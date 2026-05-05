/**
 * 月間利用量チェックミドルウェア（Phase 2）のテスト
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import {
  usageCheckMiddleware,
  getMonthlyUsageKey,
  MONTHLY_USAGE_LIMITS,
  UPGRADE_URL,
} from "../../src/middleware/usage-check.js";
import type { AppEnv } from "../../src/types/env.js";
import { createMockEnv } from "../helpers/mock-kv.js";

describe("getMonthlyUsageKey", () => {
  it("usage-monthly:{customerId}:{YYYY-MM} 形式のキーを返す", () => {
    const key = getMonthlyUsageKey("cust_123", new Date("2026-04-15T00:00:00Z"));
    expect(key).toBe("usage-monthly:cust_123:2026-04");
  });

  it("月の境界を跨いだ入力でも正しい YYYY-MM を返す", () => {
    // 2026-01-01（1月）
    const keyJan = getMonthlyUsageKey("x", new Date(2026, 0, 1));
    expect(keyJan).toBe("usage-monthly:x:2026-01");
    // 2026-12-31（12月）
    const keyDec = getMonthlyUsageKey("x", new Date(2026, 11, 31));
    expect(keyDec).toBe("usage-monthly:x:2026-12");
  });
});

describe("usageCheckMiddleware", () => {
  let app: Hono<AppEnv>;
  let env: ReturnType<typeof createMockEnv>;

  function buildApp(plan: string, customerId: string) {
    const a = new Hono<AppEnv>();
    a.use("*", async (c, next) => {
      c.set("plan", plan);
      c.set("customerId", customerId);
      await next();
    });
    a.use("*", usageCheckMiddleware);
    a.get("/test", (c) => c.json({ ok: true }));
    return a;
  }

  beforeEach(() => {
    env = createMockEnv();
  });

  it("利用量が上限未満なら通過する（Free）", async () => {
    app = buildApp("free", "anon_abc");
    const res = await app.fetch(new Request("http://localhost/test"), env);
    expect(res.status).toBe(200);
  });

  it("Freeで10,000回到達時（10,001回目）は429 + upgrade_url を返す", async () => {
    app = buildApp("free", "anon_abc");
    const key = getMonthlyUsageKey("anon_abc");
    await env.USAGE_LOGS.put(key, "10000");

    const res = await app.fetch(new Request("http://localhost/test"), env);
    expect(res.status).toBe(429);
    const body: any = await res.json();
    expect(body.error.code).toBe("USAGE_LIMIT_EXCEEDED");
    expect(body.error.upgrade_url).toBe(UPGRADE_URL);
    expect(body.error.message).toContain("Free");
    expect(body.error.message).toContain("10,000");
  });

  it("Freeで9,999回目は通過する", async () => {
    app = buildApp("free", "anon_abc");
    const key = getMonthlyUsageKey("anon_abc");
    await env.USAGE_LOGS.put(key, "9999");

    const res = await app.fetch(new Request("http://localhost/test"), env);
    expect(res.status).toBe(200);
  });

  it("Starterで500,000回到達時（500,001回目）は429を返す", async () => {
    app = buildApp("starter", "cust_starter");
    const key = getMonthlyUsageKey("cust_starter");
    await env.USAGE_LOGS.put(key, "500000");

    const res = await app.fetch(new Request("http://localhost/test"), env);
    expect(res.status).toBe(429);
    const body: any = await res.json();
    expect(body.error.code).toBe("USAGE_LIMIT_EXCEEDED");
    expect(body.error.message).toContain("Starter");
    expect(body.error.upgrade_url).toBe(UPGRADE_URL);
  });

  it("Proで5,000,000回到達時は429を返す", async () => {
    app = buildApp("pro", "cust_pro");
    const key = getMonthlyUsageKey("cust_pro");
    await env.USAGE_LOGS.put(key, "5000000");

    const res = await app.fetch(new Request("http://localhost/test"), env);
    expect(res.status).toBe(429);
    const body: any = await res.json();
    expect(body.error.message).toContain("Pro");
  });

  it("Enterpriseは上限なし（どれだけ使っても429にならない）", async () => {
    app = buildApp("enterprise", "cust_ent");
    const key = getMonthlyUsageKey("cust_ent");
    await env.USAGE_LOGS.put(key, "999999999");

    const res = await app.fetch(new Request("http://localhost/test"), env);
    expect(res.status).toBe(200);
  });

  it("authミドルウェアを通っていない（plan未設定）なら素通し", async () => {
    const noAuthApp = new Hono<AppEnv>();
    noAuthApp.use("*", usageCheckMiddleware);
    noAuthApp.get("/test", (c) => c.json({ ok: true }));

    const res = await noAuthApp.fetch(new Request("http://localhost/test"), env);
    expect(res.status).toBe(200);
  });

  it("MONTHLY_USAGE_LIMITSがspecの値と一致する", () => {
    expect(MONTHLY_USAGE_LIMITS.free).toBe(10_000);
    expect(MONTHLY_USAGE_LIMITS.starter).toBe(500_000);
    expect(MONTHLY_USAGE_LIMITS.pro).toBe(5_000_000);
    expect(MONTHLY_USAGE_LIMITS.enterprise).toBe(-1);
  });

  it("429 response に pricing_url / current_plan / next_plan / Retry-After を含む(C-1 ergonomics)", async () => {
    app = buildApp("free", "anon_abc");
    const key = getMonthlyUsageKey("anon_abc");
    await env.USAGE_LOGS.put(key, "10000");

    const res = await app.fetch(new Request("http://localhost/test"), env);
    expect(res.status).toBe(429);

    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);

    const body: any = await res.json();
    expect(body.error.upgrade_url).toBe("https://shirabe.dev/upgrade");
    expect(body.error.pricing_url).toBe("https://shirabe.dev/docs/calendar-pricing");
    expect(body.error.current_plan).toEqual({
      name: "free",
      monthly_limit: 10_000,
      monthly_used: 10_000,
    });
    expect(body.error.next_plan?.name).toBe("starter");
    expect(body.error.next_plan?.monthly_limit).toBe(500_000);
    expect(body.error.next_plan?.checkout_path).toContain("plan=starter");
  });
});
