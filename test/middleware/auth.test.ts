/**
 * APIキー認証ミドルウェアのテスト
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { authMiddleware, hashApiKey } from "../../src/middleware/auth.js";
import type { ApiKeyInfo } from "../../src/middleware/auth.js";
import type { AppEnv } from "../../src/types/env.js";
import { createMockEnv } from "../helpers/mock-kv.js";

describe("hashApiKey", () => {
  it("SHA-256ハッシュを16進数文字列で返す", async () => {
    const hash = await hashApiKey("shrb_abcdefghijklmnopqrstuvwxyz012345");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("同じ入力で同じハッシュを返す", async () => {
    const key = "shrb_abcdefghijklmnopqrstuvwxyz012345";
    const hash1 = await hashApiKey(key);
    const hash2 = await hashApiKey(key);
    expect(hash1).toBe(hash2);
  });

  it("異なる入力で異なるハッシュを返す", async () => {
    const hash1 = await hashApiKey("shrb_abcdefghijklmnopqrstuvwxyz012345");
    const hash2 = await hashApiKey("shrb_zyxwvutsrqponmlkjihgfedcba543210");
    expect(hash1).not.toBe(hash2);
  });
});

describe("authMiddleware", () => {
  let app: Hono<AppEnv>;
  let env: ReturnType<typeof createMockEnv>;
  const validKey = "shrb_abcdefghijklmnopqrstuvwxyz012345";
  let validKeyHash: string;

  beforeEach(async () => {
    env = createMockEnv();
    validKeyHash = await hashApiKey(validKey);

    const keyInfo: ApiKeyInfo = {
      plan: "starter",
      customerId: "cust_test123",
      createdAt: "2026-01-01T00:00:00Z",
    };
    await env.API_KEYS.put(validKeyHash, JSON.stringify(keyInfo));

    app = new Hono<AppEnv>();
    app.use("*", authMiddleware);
    app.get("/test", (c) => {
      return c.json({
        plan: c.get("plan"),
        customerId: c.get("customerId"),
      });
    });
  });

  it("有効なAPIキーで認証成功", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test", {
        headers: { "X-API-Key": validKey },
      }),
      env
    );

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.plan).toBe("starter");
    expect(body.customerId).toBe("cust_test123");
  });

  it("APIキーなしで401を返す", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test"),
      env
    );

    expect(res.status).toBe(401);
    const body: any = await res.json();
    expect(body.error.code).toBe("INVALID_API_KEY");
  });

  it("不正な形式のキーで401を返す", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test", {
        headers: { "X-API-Key": "invalid_key" },
      }),
      env
    );

    expect(res.status).toBe(401);
  });

  it("存在しないキーで401を返す", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test", {
        headers: { "X-API-Key": "shrb_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz" },
      }),
      env
    );

    expect(res.status).toBe(401);
  });

  it("shrb_プレフィックスがないキーで401を返す", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test", {
        headers: { "X-API-Key": "test_abcdefghijklmnopqrstuvwxyz012345" },
      }),
      env
    );

    expect(res.status).toBe(401);
  });

  it("短すぎるキーで401を返す", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test", {
        headers: { "X-API-Key": "shrb_abc" },
      }),
      env
    );

    expect(res.status).toBe(401);
  });

  it("プラン情報がコンテキストに格納される", async () => {
    // Enterpriseプランを追加
    const entKey = "shrb_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
    const entHash = await hashApiKey(entKey);
    const keyInfo: ApiKeyInfo = {
      plan: "enterprise",
      customerId: "cust_ent",
      createdAt: "2026-01-01T00:00:00Z",
    };
    await env.API_KEYS.put(entHash, JSON.stringify(keyInfo));

    const res = await app.fetch(
      new Request("http://localhost/test", {
        headers: { "X-API-Key": entKey },
      }),
      env
    );

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.plan).toBe("enterprise");
    expect(body.customerId).toBe("cust_ent");
  });
});
