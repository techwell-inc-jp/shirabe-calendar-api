/**
 * レート制限ミドルウェアのテスト
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { rateLimitMiddleware, PLAN_LIMITS } from "../../src/middleware/rate-limit.js";
import type { AppEnv } from "../../src/types/env.js";
import { createMockEnv } from "../helpers/mock-kv.js";

describe("rateLimitMiddleware", () => {
  let app: Hono<AppEnv>;
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();

    app = new Hono<AppEnv>();
    // planとcustomerIdをセットするダミーミドルウェア
    app.use("*", async (c, next) => {
      c.set("plan", "free");
      c.set("customerId", "cust_test");
      await next();
    });
    app.use("*", rateLimitMiddleware);
    app.get("/test", (c) => c.json({ ok: true }));
  });

  it("初回リクエストは通過する", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test"),
      env
    );

    expect(res.status).toBe(200);
  });

  it("レスポンスヘッダーにレート制限情報を含む", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test"),
      env
    );

    expect(res.headers.get("X-RateLimit-Limit")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });

  it("Freeプランの月間制限を超えると429を返す", async () => {
    // 月間カウンターを上限にセット
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthlyKey = `rate:monthly:cust_test:${ym}`;
    await env.RATE_LIMITS.put(monthlyKey, String(PLAN_LIMITS.free.perMonth));

    const res = await app.fetch(
      new Request("http://localhost/test"),
      env
    );

    expect(res.status).toBe(429);
    const body: any = await res.json();
    expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("秒間制限を超えると429を返す", async () => {
    // 秒間カウンターを上限にセット
    const sec = Math.floor(Date.now() / 1000);
    const secondKey = `rate:second:cust_test:${sec}`;
    await env.RATE_LIMITS.put(secondKey, String(PLAN_LIMITS.free.perSecond));

    const res = await app.fetch(
      new Request("http://localhost/test"),
      env
    );

    expect(res.status).toBe(429);
  });

  it("Enterpriseプランは月間無制限", async () => {
    // Enterpriseプランに変更
    const entApp = new Hono<AppEnv>();
    entApp.use("*", async (c, next) => {
      c.set("plan", "enterprise");
      c.set("customerId", "cust_ent");
      await next();
    });
    entApp.use("*", rateLimitMiddleware);
    entApp.get("/test", (c) => c.json({ ok: true }));

    // 大量のカウントを設定しても通過する
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthlyKey = `rate:monthly:cust_ent:${ym}`;
    await env.RATE_LIMITS.put(monthlyKey, "999999999");

    const res = await entApp.fetch(
      new Request("http://localhost/test"),
      env
    );

    expect(res.status).toBe(200);
  });

  it("プラン情報がない場合はスキップして通過する", async () => {
    const noAuthApp = new Hono<AppEnv>();
    noAuthApp.use("*", rateLimitMiddleware);
    noAuthApp.get("/test", (c) => c.json({ ok: true }));

    const res = await noAuthApp.fetch(
      new Request("http://localhost/test"),
      env
    );

    expect(res.status).toBe(200);
  });

  it("PLAN_LIMITSの設定値が正しい", () => {
    expect(PLAN_LIMITS.free.perSecond).toBe(1);
    expect(PLAN_LIMITS.free.perMonth).toBe(1_000);
    expect(PLAN_LIMITS.starter.perSecond).toBe(10);
    expect(PLAN_LIMITS.starter.perMonth).toBe(50_000);
    expect(PLAN_LIMITS.pro.perSecond).toBe(50);
    expect(PLAN_LIMITS.pro.perMonth).toBe(500_000);
    expect(PLAN_LIMITS.enterprise.perSecond).toBe(100);
    expect(PLAN_LIMITS.enterprise.perMonth).toBe(-1);
  });
});
