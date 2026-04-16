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

  it("秒次カウンター更新時に Cloudflare KV の最小 TTL (60秒) を満たす", async () => {
    // MockKV は expirationTtl < 60 を 400 エラーとして throw するため、
    // このテストは「秒次カウンターの TTL が 60 以上」であることを保証する回帰テスト。
    // 以前はハードコードで `expirationTtl: 2` だったため本番で
    // "KV PUT failed: 400 Invalid expiration_ttl of 2" が発生していた。
    const putCalls: Array<{ key: string; ttl?: number }> = [];
    const originalPut = env.RATE_LIMITS.put.bind(env.RATE_LIMITS);
    env.RATE_LIMITS.put = async (
      key: string,
      value: string,
      options?: { expirationTtl?: number; expiration?: number }
    ) => {
      putCalls.push({ key, ttl: options?.expirationTtl });
      return originalPut(key, value, options);
    };

    const res = await app.fetch(new Request("http://localhost/test"), env);
    expect(res.status).toBe(200);

    const secondPut = putCalls.find((c) => c.key.startsWith("rate:second:"));
    expect(secondPut).toBeDefined();
    expect(secondPut!.ttl).toBeGreaterThanOrEqual(60);

    const monthlyPut = putCalls.find((c) => c.key.startsWith("rate:monthly:"));
    expect(monthlyPut).toBeDefined();
    expect(monthlyPut!.ttl).toBeGreaterThanOrEqual(60);
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
