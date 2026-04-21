/**
 * S1 計測基盤: ミドルウェア統合テスト
 *
 * 観点:
 * - writeDataPoint が期待値で1回だけ呼ばれる
 * - AE書込がthrowしてもレスポンスは正常(最重要)
 * - 匿名アクセス時に plan='anonymous', apiKeyIdHash='none'
 * - 認証済みアクセス時にAPIキーハッシュと正しいプランが記録される
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { analyticsMiddleware } from "../../src/middleware/analytics.js";
import { authMiddleware } from "../../src/middleware/auth.js";
import { hashApiKey } from "../../src/middleware/auth.js";
import type { ApiKeyInfo } from "../../src/middleware/auth.js";
import type { AppEnv } from "../../src/types/env.js";
import { createMockEnv, MockAnalyticsEngine } from "../helpers/mock-kv.js";

describe("analyticsMiddleware", () => {
  let env: ReturnType<typeof createMockEnv>;
  let analytics: MockAnalyticsEngine;

  beforeEach(() => {
    env = createMockEnv();
    analytics = env.ANALYTICS;
  });

  it("ハンドラ正常時にwriteDataPointが1回だけ呼ばれる", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", analyticsMiddleware);
    app.get("/health", (c) => c.json({ status: "ok" }));

    const res = await app.fetch(new Request("http://localhost/health"), env);
    expect(res.status).toBe(200);
    expect(analytics.points.length).toBe(1);
  });

  it("blobs/doubles/indexesが仕様順で記録される(/health の場合)", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", analyticsMiddleware);
    app.get("/health", (c) => c.json({ status: "ok" }));

    await app.fetch(
      new Request("http://localhost/health", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120",
        },
      }),
      env
    );

    const point = analytics.points[0];
    expect(point.blobs).toEqual([
      "human", // ua category
      "none", // ai vendor
      "other", // referrer type
      "none", // referrer vendor
      "health", // endpoint kind
      "/health", // normalized path
      "anonymous", // plan(auth未通過)
      "none", // apiKeyIdHash
      "none", // tool hint
      "none", // content platform(Referrer なし)— 2026-04-22 追加
    ]);
    expect(point.doubles).toEqual([200, 1]);
    expect(point.indexes).toEqual(["health"]);
  });

  it("AIクローラーUA(ChatGPT-User)が ai/openai/gpts として記録される", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", analyticsMiddleware);
    app.get("/openapi.yaml", (c) => c.text("openapi: 3.1.0"));

    await app.fetch(
      new Request("http://localhost/openapi.yaml", {
        headers: {
          "User-Agent": "Mozilla/5.0 ChatGPT-User/1.0",
        },
      }),
      env
    );

    const point = analytics.points[0];
    expect(point.blobs?.[0]).toBe("ai");
    expect(point.blobs?.[1]).toBe("openai");
    expect(point.blobs?.[4]).toBe("openapi_view");
    expect(point.blobs?.[8]).toBe("gpts");
  });

  it("Perplexity Referrerが ai_search/perplexity として記録される", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", analyticsMiddleware);
    app.get("/", (c) => c.text("top"));

    await app.fetch(
      new Request("http://localhost/", {
        headers: {
          Referer: "https://www.perplexity.ai/search?q=shirabe",
          "User-Agent": "Mozilla/5.0 Chrome/120",
        },
      }),
      env
    );

    const point = analytics.points[0];
    expect(point.blobs?.[2]).toBe("ai_search");
    expect(point.blobs?.[3]).toBe("perplexity");
    // AI 検索は content_platform 観点では "other"(技術プラットフォーム非該当)
    expect(point.blobs?.[9]).toBe("other");
  });

  it("Qiita Referrer が content_platform='qiita' として記録される(B-2 観測)", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", analyticsMiddleware);
    app.get("/", (c) => c.text("top"));

    await app.fetch(
      new Request("http://localhost/", {
        headers: {
          Referer: "https://qiita.com/yosikawa-techwell/items/f21d666a7fad06cdbb51",
          "User-Agent": "Mozilla/5.0 Chrome/120",
        },
      }),
      env
    );

    const point = analytics.points[0];
    expect(point.blobs?.[2]).toBe("other"); // AI 検索ではない
    expect(point.blobs?.[3]).toBe("none"); // AI vendor 非該当
    expect(point.blobs?.[9]).toBe("qiita"); // 新 blob: content_platform
  });

  it("GitHub Referrer が content_platform='github' として記録される", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", analyticsMiddleware);
    app.get("/openapi.yaml", (c) => c.text("openapi: 3.1.0"));

    await app.fetch(
      new Request("http://localhost/openapi.yaml", {
        headers: {
          Referer: "https://github.com/techwell-inc-jp/shirabe-calendar-api",
          "User-Agent": "Mozilla/5.0 Chrome/120",
        },
      }),
      env
    );

    const point = analytics.points[0];
    expect(point.blobs?.[9]).toBe("github");
  });

  it("AE書込がthrowしてもレスポンスは正常(最重要)", async () => {
    analytics.throwOnWrite = true;

    const app = new Hono<AppEnv>();
    app.use("*", analyticsMiddleware);
    app.get("/health", (c) => c.json({ status: "ok" }));

    const res = await app.fetch(new Request("http://localhost/health"), env);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.status).toBe("ok");
  });

  it("ANALYTICSバインディング未設定でも例外を投げずレスポンスは正常", async () => {
    const envWithoutAnalytics = { ...env };
    // @ts-expect-error intentional: simulate unbound env
    delete envWithoutAnalytics.ANALYTICS;

    const app = new Hono<AppEnv>();
    app.use("*", analyticsMiddleware);
    app.get("/health", (c) => c.json({ status: "ok" }));

    const res = await app.fetch(new Request("http://localhost/health"), envWithoutAnalytics);
    expect(res.status).toBe(200);
  });

  it("ハンドラが5xxを返してもwriteDataPointは呼ばれ、doubles[1]=0 で success:false になる", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", analyticsMiddleware);
    app.get("/fail", (c) => c.json({ error: "boom" }, 500));

    const res = await app.fetch(new Request("http://localhost/fail"), env);
    expect(res.status).toBe(500);
    expect(analytics.points.length).toBe(1);
    expect(analytics.points[0].doubles).toEqual([500, 0]);
  });

  it("匿名アクセス(auth通過・APIキーなし)は plan=free, apiKeyIdHash=none", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", analyticsMiddleware);
    app.use("/api/*", authMiddleware);
    app.get("/api/v1/calendar/2026-04-18", (c) => c.json({ ok: true }));

    await app.fetch(new Request("http://localhost/api/v1/calendar/2026-04-18"), env);

    const point = analytics.points[0];
    expect(point.blobs?.[6]).toBe("free"); // plan
    expect(point.blobs?.[7]).toBe("none"); // apiKeyIdHash(匿名時は空 → middleware で "none" に正規化)
    expect(point.blobs?.[5]).toBe("/api/v1/calendar/:date"); // normalized path
  });

  it("認証済みアクセスは plan=starter, apiKeyIdHash=先頭16文字", async () => {
    const key = "shrb_abcdefghijklmnopqrstuvwxyz012345";
    const hash = await hashApiKey(key);
    const info: ApiKeyInfo = {
      plan: "starter",
      customerId: "cust_x",
      createdAt: "2026-01-01T00:00:00Z",
    };
    await env.API_KEYS.put(hash, JSON.stringify(info));

    const app = new Hono<AppEnv>();
    app.use("*", analyticsMiddleware);
    app.use("/api/*", authMiddleware);
    app.get("/api/v1/calendar/2026-04-18", (c) => c.json({ ok: true }));

    await app.fetch(
      new Request("http://localhost/api/v1/calendar/2026-04-18", {
        headers: { "X-API-Key": key },
      }),
      env
    );

    const point = analytics.points[0];
    expect(point.blobs?.[6]).toBe("starter");
    expect(point.blobs?.[7]).toBe(hash.slice(0, 16));
    expect(point.blobs?.[7]).toMatch(/^[0-9a-f]{16}$/);
  });

  it("context未setのルート(/health)は plan=anonymous, apiKeyIdHash=none", async () => {
    // /health にはauthミドルウェアを通さない想定
    const app = new Hono<AppEnv>();
    app.use("*", analyticsMiddleware);
    app.get("/health", (c) => c.json({ ok: true }));

    await app.fetch(new Request("http://localhost/health"), env);

    const point = analytics.points[0];
    expect(point.blobs?.[6]).toBe("anonymous");
    expect(point.blobs?.[7]).toBe("none");
  });

  it("無効なplan値(例: garbage)は anonymous にフォールバック", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", analyticsMiddleware);
    app.use("/test", async (c, next) => {
      // 意図的に不正な plan を設定。AppVariables.plan は string 型なので
      // 型エラーにはならないが、valid な値(free/starter/pro/enterprise)外 →
      // ミドルウェア側で anonymous へフォールバックされることを検証する。
      c.set("plan", "garbage");
      c.set("apiKeyIdHash", "");
      await next();
    });
    app.get("/test", (c) => c.json({ ok: true }));

    await app.fetch(new Request("http://localhost/test"), env);

    const point = analytics.points[0];
    expect(point.blobs?.[6]).toBe("anonymous");
  });
});
