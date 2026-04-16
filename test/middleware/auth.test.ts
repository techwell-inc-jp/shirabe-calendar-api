/**
 * APIキー認証ミドルウェアのテスト
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { authMiddleware, hashApiKey, getAnonymousId } from "../../src/middleware/auth.js";
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
        apiKeyHash: c.get("apiKeyHash"),
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

  it("APIキーなしでも匿名Freeユーザーとして通す（Phase 1）", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test", {
        headers: { "CF-Connecting-IP": "203.0.113.10" },
      }),
      env
    );

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.plan).toBe("free");
    expect(body.customerId).toMatch(/^anon_[0-9a-f]{16}$/);
    expect(body.apiKeyHash).toBe("");
  });

  it("CF-Connecting-IPヘッダーが無くても匿名Freeユーザーとして通す", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test"),
      env
    );

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.plan).toBe("free");
    expect(body.customerId).toMatch(/^anon_[0-9a-f]{16}$/);
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

describe("authMiddleware — suspended APIキー（Phase 5）", () => {
  let app: Hono<AppEnv>;
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
    app = new Hono<AppEnv>();
    app.use("*", authMiddleware);
    app.get("/test", (c) =>
      c.json({
        plan: c.get("plan"),
        customerId: c.get("customerId"),
      })
    );
  });

  it("status:'suspended' のAPIキーで403 + API_KEY_SUSPENDED を返す", async () => {
    const key = "shrb_suspendedkeyaaaaaaaaaaaaaaaaaaaa";
    const hash = await hashApiKey(key);
    const info: ApiKeyInfo = {
      plan: "starter",
      customerId: "cust_sus",
      status: "suspended",
      createdAt: "2026-01-01T00:00:00Z",
    };
    await env.API_KEYS.put(hash, JSON.stringify(info));

    const res = await app.fetch(
      new Request("http://localhost/test", { headers: { "X-API-Key": key } }),
      env
    );

    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body.error.code).toBe("API_KEY_SUSPENDED");
    expect(body.error.message).toContain("https://shirabe.dev/billing");
  });

  it("status:'active' のAPIキーは正常通過する", async () => {
    const key = "shrb_activekeyaaaaaaaaaaaaaaaaaaaaaaa";
    const hash = await hashApiKey(key);
    const info: ApiKeyInfo = {
      plan: "pro",
      customerId: "cust_active",
      status: "active",
      createdAt: "2026-01-01T00:00:00Z",
    };
    await env.API_KEYS.put(hash, JSON.stringify(info));

    const res = await app.fetch(
      new Request("http://localhost/test", { headers: { "X-API-Key": key } }),
      env
    );

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.plan).toBe("pro");
    expect(body.customerId).toBe("cust_active");
  });

  it("status 未設定のAPIキーは 'active' 扱いで通過する（後方互換）", async () => {
    const key = "shrb_legacykeyaaaaaaaaaaaaaaaaaaaaaaa";
    const hash = await hashApiKey(key);
    // status フィールドなし（旧スキーマ）
    const info: ApiKeyInfo = {
      plan: "starter",
      customerId: "cust_legacy",
      createdAt: "2026-01-01T00:00:00Z",
    };
    await env.API_KEYS.put(hash, JSON.stringify(info));

    const res = await app.fetch(
      new Request("http://localhost/test", { headers: { "X-API-Key": key } }),
      env
    );

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.plan).toBe("starter");
    expect(body.customerId).toBe("cust_legacy");
  });

  it("匿名Freeユーザー（APIキーなし）は suspended 判定の影響を受けない", async () => {
    const res = await app.fetch(new Request("http://localhost/test"), env);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.plan).toBe("free");
    expect(body.customerId).toMatch(/^anon_[0-9a-f]{16}$/);
  });
});

describe("getAnonymousId (Phase 1)", () => {
  function buildContext(headers: Record<string, string>): any {
    return {
      req: {
        header: (name: string) => headers[name],
      },
    };
  }

  it("CF-Connecting-IPからanon_ + 16文字の16進ハッシュを返す", async () => {
    const id = await getAnonymousId(buildContext({ "CF-Connecting-IP": "203.0.113.10" }));
    expect(id).toMatch(/^anon_[0-9a-f]{16}$/);
  });

  it("同じIPで同じIDを返す", async () => {
    const id1 = await getAnonymousId(buildContext({ "CF-Connecting-IP": "198.51.100.1" }));
    const id2 = await getAnonymousId(buildContext({ "CF-Connecting-IP": "198.51.100.1" }));
    expect(id1).toBe(id2);
  });

  it("異なるIPで異なるIDを返す", async () => {
    const id1 = await getAnonymousId(buildContext({ "CF-Connecting-IP": "198.51.100.1" }));
    const id2 = await getAnonymousId(buildContext({ "CF-Connecting-IP": "198.51.100.2" }));
    expect(id1).not.toBe(id2);
  });

  it("CF-Connecting-IPが無くても anon_ 形式のIDを返す", async () => {
    const id = await getAnonymousId(buildContext({}));
    expect(id).toMatch(/^anon_[0-9a-f]{16}$/);
  });
});
