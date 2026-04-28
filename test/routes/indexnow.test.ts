/**
 * IndexNow protocol(B-1 加速、PR #34)テスト
 *
 * 対象:
 * - GET /{INDEXNOW_KEY}.txt 検証ファイル配信
 * - POST /internal/indexnow/submit 管理 endpoint(Basic 認証 + sitemap target 解析)
 * - pure functions: getUrlsForSitemap / splitBatches / submitBatchToIndexNow / serveIndexNowKey
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import app from "../../src/index.js";
import { createMockEnv } from "../helpers/mock-kv.js";
import {
  getUrlsForSitemap,
  splitBatches,
  submitBatchToIndexNow,
  serveIndexNowKey,
  INDEXNOW_BATCH_LIMIT,
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY_REGEX,
  SHIRABE_HOST,
} from "../../src/routes/indexnow.js";

const VALID_KEY = "550e8400e29b41d4a716446655440000"; // 32 hex chars
const BASIC_AUTH = `Basic ${btoa("admin:s3cret")}`;

function envWithIndexNow(overrides: Partial<{ INDEXNOW_KEY: string; INTERNAL_STATS_USER: string; INTERNAL_STATS_PASS: string }> = {}) {
  return {
    ...createMockEnv(),
    INDEXNOW_KEY: overrides.INDEXNOW_KEY ?? VALID_KEY,
    INTERNAL_STATS_USER: overrides.INTERNAL_STATS_USER ?? "admin",
    INTERNAL_STATS_PASS: overrides.INTERNAL_STATS_PASS ?? "s3cret",
  };
}

// ---------------------------------------------------------------------------
// pure functions
// ---------------------------------------------------------------------------

describe("INDEXNOW_KEY_REGEX (8〜128 hex/dash characters)", () => {
  it("32 hex 文字を accept", () => {
    expect(INDEXNOW_KEY_REGEX.test(VALID_KEY)).toBe(true);
  });

  it("8 文字を accept(最小値)", () => {
    expect(INDEXNOW_KEY_REGEX.test("a1b2c3d4")).toBe(true);
  });

  it("128 文字を accept(最大値)", () => {
    expect(INDEXNOW_KEY_REGEX.test("a".repeat(128))).toBe(true);
  });

  it("7 文字は reject(最小値未満)", () => {
    expect(INDEXNOW_KEY_REGEX.test("a1b2c3d")).toBe(false);
  });

  it("129 文字は reject(最大値超過)", () => {
    expect(INDEXNOW_KEY_REGEX.test("a".repeat(129))).toBe(false);
  });

  it("hex 以外の文字(g, z 等)を含むと reject", () => {
    expect(INDEXNOW_KEY_REGEX.test("g1g1g1g1")).toBe(false);
    expect(INDEXNOW_KEY_REGEX.test("zzzzzzzz")).toBe(false);
  });

  it("ダッシュ含む UUID 形式を accept", () => {
    expect(INDEXNOW_KEY_REGEX.test("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });
});

describe("getUrlsForSitemap", () => {
  it("docs target は DOCS_SITEMAP_PAGES の URL を返す", () => {
    const urls = getUrlsForSitemap("docs");
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.startsWith("https://shirabe.dev/"))).toBe(true);
    expect(urls).toContain("https://shirabe.dev/");
    expect(urls).toContain("https://shirabe.dev/llms.txt");
  });

  it("days-1 target は 1873-1949 の日付 URL を返す(約 27K)", () => {
    const urls = getUrlsForSitemap("days-1");
    expect(urls.length).toBeGreaterThan(27_000);
    expect(urls.length).toBeLessThan(29_000);
    expect(urls[0]).toBe("https://shirabe.dev/days/1873-01-01/");
    expect(urls[urls.length - 1]).toBe("https://shirabe.dev/days/1949-12-31/");
  });

  it("days-2 target は 1950-1999 の日付 URL を返す(約 18K)", () => {
    const urls = getUrlsForSitemap("days-2");
    expect(urls.length).toBeGreaterThan(18_000);
    expect(urls.length).toBeLessThan(19_000);
    expect(urls[0]).toBe("https://shirabe.dev/days/1950-01-01/");
  });

  it("days-3 target は 2000-2049 の日付 URL を返す", () => {
    const urls = getUrlsForSitemap("days-3");
    expect(urls[0]).toBe("https://shirabe.dev/days/2000-01-01/");
    expect(urls[urls.length - 1]).toBe("https://shirabe.dev/days/2049-12-31/");
  });

  it("days-4 target は 2050-2100 の日付 URL を返す", () => {
    const urls = getUrlsForSitemap("days-4");
    expect(urls[0]).toBe("https://shirabe.dev/days/2050-01-01/");
    expect(urls[urls.length - 1]).toBe("https://shirabe.dev/days/2100-12-31/");
  });

  it("purposes target は 8,400 URL を返す(28 cat × 25 年 × 12 月)", () => {
    const urls = getUrlsForSitemap("purposes");
    expect(urls.length).toBe(28 * 25 * 12);
    expect(urls[0]).toMatch(/^https:\/\/shirabe\.dev\/purposes\/[a-z-]+\/2010-01\/$/);
  });

  it("all target は全 sub-sitemap を結合(約 91K)", () => {
    const urls = getUrlsForSitemap("all");
    const expected =
      getUrlsForSitemap("docs").length +
      getUrlsForSitemap("days-1").length +
      getUrlsForSitemap("days-2").length +
      getUrlsForSitemap("days-3").length +
      getUrlsForSitemap("days-4").length +
      getUrlsForSitemap("purposes").length;
    expect(urls.length).toBe(expected);
    expect(urls.length).toBeGreaterThan(90_000);
  });
});

describe("splitBatches", () => {
  it("batch 上限以下なら 1 batch に収まる", () => {
    const urls = ["a", "b", "c"];
    const batches = splitBatches(urls, 10);
    expect(batches).toEqual([["a", "b", "c"]]);
  });

  it("batch 上限ちょうどなら 1 batch", () => {
    const urls = Array(10).fill("x");
    const batches = splitBatches(urls, 10);
    expect(batches.length).toBe(1);
    expect(batches[0]!.length).toBe(10);
  });

  it("batch 上限を超えると複数 batch に分割される", () => {
    const urls = Array(25).fill("x");
    const batches = splitBatches(urls, 10);
    expect(batches.length).toBe(3);
    expect(batches[0]!.length).toBe(10);
    expect(batches[1]!.length).toBe(10);
    expect(batches[2]!.length).toBe(5);
  });

  it("空配列は空 batch 配列を返す", () => {
    expect(splitBatches([], 10)).toEqual([]);
  });

  it("default batchSize は 10,000", () => {
    expect(INDEXNOW_BATCH_LIMIT).toBe(10_000);
    const urls = Array(25_000).fill("x");
    const batches = splitBatches(urls);
    expect(batches.length).toBe(3);
    expect(batches[0]!.length).toBe(10_000);
    expect(batches[1]!.length).toBe(10_000);
    expect(batches[2]!.length).toBe(5_000);
  });

  it("batchSize < 1 は throw", () => {
    expect(() => splitBatches(["a"], 0)).toThrow();
  });
});

describe("submitBatchToIndexNow (mocked fetch)", () => {
  it("200 OK を ok=true で返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    const result = await submitBatchToIndexNow(["https://shirabe.dev/"], VALID_KEY, fetchMock);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(200);
      expect(result.submittedCount).toBe(1);
    }
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(INDEXNOW_ENDPOINT, expect.objectContaining({ method: "POST" }));
  });

  it("202 Accepted を ok=true で返す(key 検証中)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 202 }));
    const result = await submitBatchToIndexNow(["https://shirabe.dev/"], VALID_KEY, fetchMock);
    expect(result.ok).toBe(true);
  });

  it("403 Forbidden を ok=false で返す(key 無効)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("invalid key", { status: 403 }));
    const result = await submitBatchToIndexNow(["https://shirabe.dev/"], VALID_KEY, fetchMock);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.message).toContain("invalid key");
    }
  });

  it("422 Unprocessable を ok=false で返す(host 不一致)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("host mismatch", { status: 422 }));
    const result = await submitBatchToIndexNow(["https://shirabe.dev/"], VALID_KEY, fetchMock);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
    }
  });

  it("429 Too Many Requests を ok=false で返す(spam 判定)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
    const result = await submitBatchToIndexNow(["https://shirabe.dev/"], VALID_KEY, fetchMock);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(429);
  });

  it("network error を ok=false / status=0 で返す", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await submitBatchToIndexNow(["https://shirabe.dev/"], VALID_KEY, fetchMock);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(0);
      expect(result.message).toContain("ECONNREFUSED");
    }
  });

  it("body に host / key / keyLocation / urlList が含まれる", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    await submitBatchToIndexNow(
      ["https://shirabe.dev/", "https://shirabe.dev/days/2026-06-15/"],
      VALID_KEY,
      fetchMock
    );
    const callArgs = fetchMock.mock.calls[0]!;
    const body = JSON.parse(callArgs[1]!.body as string);
    expect(body.host).toBe(SHIRABE_HOST);
    expect(body.key).toBe(VALID_KEY);
    expect(body.keyLocation).toBe(`https://${SHIRABE_HOST}/${VALID_KEY}.txt`);
    expect(body.urlList).toEqual([
      "https://shirabe.dev/",
      "https://shirabe.dev/days/2026-06-15/",
    ]);
  });
});

describe("serveIndexNowKey (pure function)", () => {
  it("INDEXNOW_KEY 未設定なら 404", () => {
    const r = serveIndexNowKey(`${VALID_KEY}.txt`, undefined);
    expect(r.status).toBe(404);
  });

  it("INDEXNOW_KEY と完全一致しない keyfile は 404", () => {
    const r = serveIndexNowKey("deadbeefdeadbeefdeadbeefdeadbeef.txt", VALID_KEY);
    expect(r.status).toBe(404);
  });

  it("INDEXNOW_KEY と一致する keyfile は 200 + body = key", () => {
    const r = serveIndexNowKey(`${VALID_KEY}.txt`, VALID_KEY);
    expect(r.status).toBe(200);
    expect(r.body).toBe(VALID_KEY);
    expect(r.contentType).toContain("text/plain");
  });
});

// ---------------------------------------------------------------------------
// HTTP routes
// ---------------------------------------------------------------------------

describe("GET /{INDEXNOW_KEY}.txt(検証ファイル)", () => {
  it("INDEXNOW_KEY 設定時、key と一致する path で 200 + key 値を返す", async () => {
    const env = envWithIndexNow();
    const res = await app.fetch(new Request(`http://localhost/${VALID_KEY}.txt`), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toBe(VALID_KEY);
  });

  it("不一致の hex 形式 path は 404", async () => {
    const env = envWithIndexNow();
    const res = await app.fetch(
      new Request("http://localhost/deadbeefdeadbeefdeadbeefdeadbeef.txt"),
      env
    );
    expect(res.status).toBe(404);
  });

  it("INDEXNOW_KEY 未設定時は 404", async () => {
    const env = { ...createMockEnv() }; // INDEXNOW_KEY なし
    const res = await app.fetch(new Request(`http://localhost/${VALID_KEY}.txt`), env);
    expect(res.status).toBe(404);
  });

  it("/llms.txt(英文字、hex 不一致)は IndexNow route に取られず llms.txt 本来のレスポンス", async () => {
    const env = envWithIndexNow();
    const res = await app.fetch(new Request("http://localhost/llms.txt"), env);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Shirabe");
  });

  it("/robots.txt(英文字)は IndexNow route に取られず robots.txt 本来のレスポンス", async () => {
    const env = envWithIndexNow();
    const res = await app.fetch(new Request("http://localhost/robots.txt"), env);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("User-agent");
  });
});

describe("POST /internal/indexnow/submit", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("", { status: 200 })) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("Basic 認証なしで 401", async () => {
    const env = envWithIndexNow();
    const res = await app.fetch(
      new Request("http://localhost/internal/indexnow/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sitemap: "docs" }),
      }),
      env
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("Basic 認証 invalid で 401", async () => {
    const env = envWithIndexNow();
    const res = await app.fetch(
      new Request("http://localhost/internal/indexnow/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${btoa("admin:wrong")}`,
        },
        body: JSON.stringify({ sitemap: "docs" }),
      }),
      env
    );
    expect(res.status).toBe(401);
  });

  it("INDEXNOW_KEY 未設定で 500", async () => {
    const env = {
      ...createMockEnv(),
      INTERNAL_STATS_USER: "admin",
      INTERNAL_STATS_PASS: "s3cret",
    };
    const res = await app.fetch(
      new Request("http://localhost/internal/indexnow/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: BASIC_AUTH,
        },
        body: JSON.stringify({ sitemap: "docs" }),
      }),
      env
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CONFIG_MISSING");
  });

  it("body 不正 JSON で 400", async () => {
    const env = envWithIndexNow();
    const res = await app.fetch(
      new Request("http://localhost/internal/indexnow/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: BASIC_AUTH,
        },
        body: "not json",
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it("sitemap target 不正で 400", async () => {
    const env = envWithIndexNow();
    const res = await app.fetch(
      new Request("http://localhost/internal/indexnow/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: BASIC_AUTH,
        },
        body: JSON.stringify({ sitemap: "invalid" }),
      }),
      env
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_PARAMS");
  });

  it("sitemap=docs で submit 成功(全 batch ok)", async () => {
    const env = envWithIndexNow();
    const res = await app.fetch(
      new Request("http://localhost/internal/indexnow/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: BASIC_AUTH,
        },
        body: JSON.stringify({ sitemap: "docs" }),
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      target: string;
      totalUrls: number;
      batchCount: number;
      successBatches: number;
      failedBatches: number;
      submittedUrls: number;
    };
    expect(body.target).toBe("docs");
    expect(body.batchCount).toBe(1); // docs は < 10K
    expect(body.successBatches).toBe(1);
    expect(body.failedBatches).toBe(0);
    expect(body.submittedUrls).toBe(body.totalUrls);
  });

  it("sitemap=days-1 で複数 batch 分割(28K URL → 3 batch)", async () => {
    const env = envWithIndexNow();
    const res = await app.fetch(
      new Request("http://localhost/internal/indexnow/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: BASIC_AUTH,
        },
        body: JSON.stringify({ sitemap: "days-1" }),
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { batchCount: number; totalUrls: number };
    expect(body.batchCount).toBe(3); // 28K → 10K + 10K + 8K
    expect(body.totalUrls).toBeGreaterThan(27_000);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("一部 batch が 429 失敗時、successBatches/failedBatches が分かれて記録される", async () => {
    const env = envWithIndexNow();
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 2) return new Response("rate limited", { status: 429 });
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;

    const res = await app.fetch(
      new Request("http://localhost/internal/indexnow/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: BASIC_AUTH,
        },
        body: JSON.stringify({ sitemap: "days-1" }),
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      successBatches: number;
      failedBatches: number;
      errors: Array<{ batchIndex: number; status: number }>;
    };
    expect(body.successBatches).toBe(2);
    expect(body.failedBatches).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]!.batchIndex).toBe(1);
    expect(body.errors[0]!.status).toBe(429);
  });
});
