/**
 * 利用量ログミドルウェアのテスト
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { usageLoggerMiddleware, getUsageKey, getIndexKey } from "../../src/middleware/usage-logger.js";
import type { AppEnv } from "../../src/types/env.js";
import { MockKV, createMockEnv } from "../helpers/mock-kv.js";

describe("usageLoggerMiddleware", () => {
  let app: Hono<AppEnv>;
  let env: ReturnType<typeof createMockEnv>;
  const mockUsageKV = () => env.USAGE_LOGS as unknown as MockKV;

  beforeEach(() => {
    env = createMockEnv();

    app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("customerId", "cust_test");
      await next();
    });
    app.use("*", usageLoggerMiddleware);
    app.get("/ok", (c) => c.json({ ok: true }));
    app.get("/error", (c) => c.json({ error: "bad" }, 500));
  });

  it("正常レスポンスの場合、利用量がカウントされる", async () => {
    await app.fetch(new Request("http://localhost/ok"), env);

    const key = getUsageKey("cust_test");
    const count = await env.USAGE_LOGS.get(key);
    expect(count).toBe("1");
  });

  it("複数リクエストでカウントが増加する", async () => {
    await app.fetch(new Request("http://localhost/ok"), env);
    await app.fetch(new Request("http://localhost/ok"), env);
    await app.fetch(new Request("http://localhost/ok"), env);

    const key = getUsageKey("cust_test");
    const count = await env.USAGE_LOGS.get(key);
    expect(count).toBe("3");
  });

  it("エラーレスポンスの場合、カウントされない", async () => {
    await app.fetch(new Request("http://localhost/error"), env);

    const key = getUsageKey("cust_test");
    const count = await env.USAGE_LOGS.get(key);
    expect(count).toBeNull();
  });

  it("日付インデックスにcustomerIdが記録される", async () => {
    await app.fetch(new Request("http://localhost/ok"), env);

    const indexKey = getIndexKey();
    const index = await env.USAGE_LOGS.get(indexKey);
    expect(index).toContain("cust_test");
  });

  it("customerIdが未設定の場合はログなし", async () => {
    const noAuthApp = new Hono<AppEnv>();
    noAuthApp.use("*", usageLoggerMiddleware);
    noAuthApp.get("/ok", (c) => c.json({ ok: true }));

    await noAuthApp.fetch(new Request("http://localhost/ok"), env);

    // customerIdがないのでログなし
    expect(mockUsageKV().size).toBe(0);
  });
});

describe("getUsageKey", () => {
  it("正しい形式のキーを生成する", () => {
    const key = getUsageKey("cust_123");
    expect(key).toMatch(/^usage:cust_123:\d{4}-\d{2}-\d{2}$/);
  });
});

describe("getIndexKey", () => {
  it("正しい形式のキーを生成する", () => {
    const key = getIndexKey();
    expect(key).toMatch(/^usage-index:\d{4}-\d{2}-\d{2}$/);
  });
});
