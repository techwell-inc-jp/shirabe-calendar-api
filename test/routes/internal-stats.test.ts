/**
 * S1 計測基盤: /internal/stats エンドポイントのテスト
 *
 * 観点:
 * - Basic認証の厳格検証(欠落/形式不正/誤資格情報/Secrets未設定)
 * - 日付パラメータの厳格検証(SQLインジェクション対策)
 * - AE SQL API呼出の成否パススルー
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { Hono } from "hono";
import {
  internalStats,
  constantTimeEquals,
  buildStatsSQL,
} from "../../src/routes/internal-stats.js";
import type { AppEnv } from "../../src/types/env.js";

type Env = AppEnv["Bindings"];

function makeApp(env: Partial<Env>) {
  const app = new Hono<AppEnv>();
  app.route("/internal", internalStats);
  return { app, env: env as unknown as Record<string, unknown> };
}

function basicAuthHeader(user: string, pass: string): string {
  return `Basic ${btoa(`${user}:${pass}`)}`;
}

describe("constantTimeEquals", () => {
  it("同一文字列はtrue", () => {
    expect(constantTimeEquals("abc", "abc")).toBe(true);
  });
  it("異なる文字列はfalse", () => {
    expect(constantTimeEquals("abc", "abd")).toBe(false);
  });
  it("長さ違いはfalse", () => {
    expect(constantTimeEquals("abc", "abcd")).toBe(false);
  });
  it("空文字同士はtrue", () => {
    expect(constantTimeEquals("", "")).toBe(true);
  });
});

describe("buildStatsSQL", () => {
  it("データセット名と日付をSQLに埋め込む", () => {
    const sql = buildStatsSQL("2026-04-18", "2026-04-19");
    expect(sql).toContain("FROM shirabe_calendar_events");
    expect(sql).toContain("'2026-04-18 00:00:00'");
    expect(sql).toContain("'2026-04-19 00:00:00'");
    expect(sql).toContain("GROUP BY");
  });
});

describe("GET /internal/stats — Basic認証", () => {
  it("Authorizationヘッダー欠落で401", async () => {
    const { app, env } = makeApp({
      INTERNAL_STATS_USER: "admin",
      INTERNAL_STATS_PASS: "secret",
    });
    const res = await app.fetch(
      new Request("http://localhost/internal/stats?from=2026-04-18&to=2026-04-19"),
      env
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("Secrets未設定は401(全拒否)", async () => {
    const { app, env } = makeApp({});
    const res = await app.fetch(
      new Request("http://localhost/internal/stats?from=2026-04-18&to=2026-04-19", {
        headers: { Authorization: basicAuthHeader("admin", "secret") },
      }),
      env
    );
    expect(res.status).toBe(401);
  });

  it("誤資格情報で401", async () => {
    const { app, env } = makeApp({
      INTERNAL_STATS_USER: "admin",
      INTERNAL_STATS_PASS: "secret",
    });
    const res = await app.fetch(
      new Request("http://localhost/internal/stats?from=2026-04-18&to=2026-04-19", {
        headers: { Authorization: basicAuthHeader("admin", "wrong") },
      }),
      env
    );
    expect(res.status).toBe(401);
  });

  it("Basic以外のスキーム(Bearer)は401", async () => {
    const { app, env } = makeApp({
      INTERNAL_STATS_USER: "admin",
      INTERNAL_STATS_PASS: "secret",
    });
    const res = await app.fetch(
      new Request("http://localhost/internal/stats?from=2026-04-18&to=2026-04-19", {
        headers: { Authorization: "Bearer sometoken" },
      }),
      env
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /internal/stats — パラメータ検証", () => {
  const authHdr = basicAuthHeader("admin", "secret");

  it("from/to未指定で400", async () => {
    const { app, env } = makeApp({
      INTERNAL_STATS_USER: "admin",
      INTERNAL_STATS_PASS: "secret",
      CF_ACCOUNT_ID: "acc",
      CF_AE_READ_TOKEN: "tok",
    });
    const res = await app.fetch(
      new Request("http://localhost/internal/stats", {
        headers: { Authorization: authHdr },
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it("不正な日付形式(2026/04/18)で400", async () => {
    const { app, env } = makeApp({
      INTERNAL_STATS_USER: "admin",
      INTERNAL_STATS_PASS: "secret",
      CF_ACCOUNT_ID: "acc",
      CF_AE_READ_TOKEN: "tok",
    });
    const res = await app.fetch(
      new Request("http://localhost/internal/stats?from=2026/04/18&to=2026/04/19", {
        headers: { Authorization: authHdr },
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it("SQLインジェクション試行(シングルクォート/セミコロン含む)を400で弾く", async () => {
    const { app, env } = makeApp({
      INTERNAL_STATS_USER: "admin",
      INTERNAL_STATS_PASS: "secret",
      CF_ACCOUNT_ID: "acc",
      CF_AE_READ_TOKEN: "tok",
    });
    const res = await app.fetch(
      new Request(
        "http://localhost/internal/stats?from=2026-04-18';DROP--&to=2026-04-19",
        { headers: { Authorization: authHdr } }
      ),
      env
    );
    expect(res.status).toBe(400);
  });

  it("from > to で400", async () => {
    const { app, env } = makeApp({
      INTERNAL_STATS_USER: "admin",
      INTERNAL_STATS_PASS: "secret",
      CF_ACCOUNT_ID: "acc",
      CF_AE_READ_TOKEN: "tok",
    });
    const res = await app.fetch(
      new Request("http://localhost/internal/stats?from=2026-04-20&to=2026-04-19", {
        headers: { Authorization: authHdr },
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it("AE用Secret(CF_ACCOUNT_ID/CF_AE_READ_TOKEN)未設定は500", async () => {
    const { app, env } = makeApp({
      INTERNAL_STATS_USER: "admin",
      INTERNAL_STATS_PASS: "secret",
    });
    const res = await app.fetch(
      new Request("http://localhost/internal/stats?from=2026-04-18&to=2026-04-19", {
        headers: { Authorization: authHdr },
      }),
      env
    );
    expect(res.status).toBe(500);
    const body: any = await res.json();
    expect(body.error.code).toBe("CONFIG_MISSING");
  });
});

describe("GET /internal/stats — AE SQL API 呼出", () => {
  const authHdr = basicAuthHeader("admin", "secret");
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("AE APIが成功レスポンスを返したらJSONで返す", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: [{ ua_category: "ai", requests: 42, success_count: 40 }],
          meta: { rows: 1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof globalThis.fetch;

    const { app, env } = makeApp({
      INTERNAL_STATS_USER: "admin",
      INTERNAL_STATS_PASS: "secret",
      CF_ACCOUNT_ID: "acc",
      CF_AE_READ_TOKEN: "tok",
    });
    const res = await app.fetch(
      new Request("http://localhost/internal/stats?from=2026-04-18&to=2026-04-19", {
        headers: { Authorization: authHdr },
      }),
      env
    );
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.range).toEqual({ from: "2026-04-18", to: "2026-04-19" });
    expect(body.rows.length).toBe(1);
    expect(body.rows[0].ua_category).toBe("ai");
  });

  it("AE APIが401を返したら502でエラーを返す", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response("unauthorized", { status: 401 });
    }) as typeof globalThis.fetch;

    const { app, env } = makeApp({
      INTERNAL_STATS_USER: "admin",
      INTERNAL_STATS_PASS: "secret",
      CF_ACCOUNT_ID: "acc",
      CF_AE_READ_TOKEN: "tok",
    });
    const res = await app.fetch(
      new Request("http://localhost/internal/stats?from=2026-04-18&to=2026-04-19", {
        headers: { Authorization: authHdr },
      }),
      env
    );
    expect(res.status).toBe(502);
    const body: any = await res.json();
    expect(body.error.code).toBe("AE_QUERY_FAILED");
  });

  it("AE API呼出がAuthorization: Bearer でトークンを送っている", async () => {
    const captured: { url?: string; headers?: Record<string, string>; body?: string } = {};
    globalThis.fetch = vi.fn(async (url, init) => {
      captured.url = String(url);
      captured.headers = (init?.headers ?? {}) as Record<string, string>;
      captured.body = typeof init?.body === "string" ? init.body : "";
      return new Response(JSON.stringify({ data: [], meta: {} }), { status: 200 });
    }) as typeof globalThis.fetch;

    const { app, env } = makeApp({
      INTERNAL_STATS_USER: "admin",
      INTERNAL_STATS_PASS: "secret",
      CF_ACCOUNT_ID: "account-xyz",
      CF_AE_READ_TOKEN: "token-abc",
    });
    await app.fetch(
      new Request("http://localhost/internal/stats?from=2026-04-18&to=2026-04-19", {
        headers: { Authorization: authHdr },
      }),
      env
    );

    expect(captured.url).toContain("/accounts/account-xyz/analytics_engine/sql");
    expect(captured.headers?.Authorization).toBe("Bearer token-abc");
    expect(captured.body).toContain("FROM shirabe_calendar_events");
    expect(captured.body).toContain("2026-04-18");
  });
});
