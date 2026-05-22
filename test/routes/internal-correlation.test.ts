/**
 * G-A Phase 1: /internal/correlation エンドポイントのテスト
 *
 * 観点:
 * - Basic 認証(internal-stats と同 credential)の厳格検証
 * - correlation:* KV エントリの読出 + email_sha256 抽出
 * - 破損エントリのスキップ(drift 許容)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { internalCorrelation } from "../../src/routes/internal-correlation.js";
import type { AppEnv } from "../../src/types/env.js";
import { createMockEnv } from "../helpers/mock-kv.js";

function makeApp(env: ReturnType<typeof createMockEnv>) {
  const app = new Hono<AppEnv>();
  app.route("/internal", internalCorrelation);
  return { app, env: { ...env, INTERNAL_STATS_USER: "admin", INTERNAL_STATS_PASS: "secret" } };
}

function basicAuth(user: string, pass: string): string {
  return `Basic ${btoa(`${user}:${pass}`)}`;
}

describe("GET /internal/correlation — Basic 認証", () => {
  it("Authorization ヘッダー欠落で 401", async () => {
    const { app, env } = makeApp(createMockEnv());
    const res = await app.fetch(new Request("http://localhost/internal/correlation"), env);
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("誤資格情報で 401", async () => {
    const { app, env } = makeApp(createMockEnv());
    const res = await app.fetch(
      new Request("http://localhost/internal/correlation", {
        headers: { Authorization: basicAuth("admin", "wrong") },
      }),
      env
    );
    expect(res.status).toBe(401);
  });

  it("Secrets 未設定は 401(全拒否)", async () => {
    const baseEnv = createMockEnv();
    const app = new Hono<AppEnv>();
    app.route("/internal", internalCorrelation);
    const res = await app.fetch(
      new Request("http://localhost/internal/correlation", {
        headers: { Authorization: basicAuth("admin", "secret") },
      }),
      baseEnv
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /internal/correlation — エントリ読出", () => {
  let app: Hono<AppEnv>;
  let env: ReturnType<typeof makeApp>["env"];

  beforeEach(() => {
    const made = makeApp(createMockEnv());
    app = made.app;
    env = made.env;
  });

  it("correlation エントリ 0 件で空配列を返す", async () => {
    const res = await app.fetch(
      new Request("http://localhost/internal/correlation", {
        headers: { Authorization: basicAuth("admin", "secret") },
      }),
      env
    );
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.api).toBe("calendar");
    expect(body.entries).toEqual([]);
    expect(body.next_cursor).toBeUndefined();
  });

  it("correlation エントリを email_sha256 付きで返す", async () => {
    const entry1 = {
      api: "calendar",
      stripe_customer_id: "cus_test_1",
      plan: "starter",
      status: "active",
      subscribed_at: "2026-05-25T10:00:00.000Z",
      updated_at: "2026-05-25T10:00:00.000Z",
    };
    const entry2 = {
      api: "calendar",
      stripe_customer_id: "cus_test_2",
      plan: "pro",
      status: "active",
      subscribed_at: "2026-05-26T10:00:00.000Z",
      updated_at: "2026-05-26T10:00:00.000Z",
    };
    await env.USAGE_LOGS.put("correlation:abc123", JSON.stringify(entry1));
    await env.USAGE_LOGS.put("correlation:def456", JSON.stringify(entry2));

    const res = await app.fetch(
      new Request("http://localhost/internal/correlation", {
        headers: { Authorization: basicAuth("admin", "secret") },
      }),
      env
    );
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.entries).toHaveLength(2);
    const emails = body.entries.map((e: any) => e.email_sha256).sort();
    expect(emails).toEqual(["abc123", "def456"]);
    const entryByHash = (hash: string) =>
      body.entries.find((e: any) => e.email_sha256 === hash);
    expect(entryByHash("abc123").stripe_customer_id).toBe("cus_test_1");
    expect(entryByHash("def456").plan).toBe("pro");
  });

  it("非 correlation prefix のキーは含まない", async () => {
    await env.USAGE_LOGS.put("correlation:xxx", JSON.stringify({ api: "calendar", plan: "free", status: "active", subscribed_at: "t", updated_at: "t" }));
    await env.USAGE_LOGS.put("email:user@example.com", "some_hash");
    await env.USAGE_LOGS.put("stripe-reverse:cus_xxx", "data");

    const res = await app.fetch(
      new Request("http://localhost/internal/correlation", {
        headers: { Authorization: basicAuth("admin", "secret") },
      }),
      env
    );
    const body: any = await res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].email_sha256).toBe("xxx");
  });

  it("破損 JSON エントリはスキップ(drift 許容)", async () => {
    await env.USAGE_LOGS.put("correlation:good", JSON.stringify({ api: "calendar", plan: "starter", status: "active", subscribed_at: "t", updated_at: "t" }));
    await env.USAGE_LOGS.put("correlation:broken", "not-valid-json{");

    const res = await app.fetch(
      new Request("http://localhost/internal/correlation", {
        headers: { Authorization: basicAuth("admin", "secret") },
      }),
      env
    );
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].email_sha256).toBe("good");
  });
});
