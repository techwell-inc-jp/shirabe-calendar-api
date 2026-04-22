/**
 * OpenAPI 配信ルートのスモークテスト。
 *
 * /openapi.yaml        : 日英併記本家版(D-1 品質化済、x-llm-hint あり)
 * /openapi-gpts.yaml   : GPT Builder Actions 互換の短縮版(全 description ≤ 300 字、x-llm-hint なし)
 *
 * 両ルートとも認証不要(/api/* ミドルウェア適用範囲外)。
 * vitest.config.ts の yamlAsText プラグインで docs/*.yaml が文字列として読み込まれる。
 */
import { describe, it, expect } from "vitest";
import app from "../../src/index.js";
import { MockKV, MockAnalyticsEngine } from "../helpers/mock-kv.js";

function createEnv(): Record<string, unknown> {
  return {
    API_VERSION: "1.0.0",
    API_KEYS: new MockKV(),
    RATE_LIMITS: new MockKV(),
    USAGE_LOGS: new MockKV(),
    ANALYTICS: new MockAnalyticsEngine(),
  };
}

describe("GET /openapi.yaml", () => {
  it("日英併記本家の OpenAPI 3.1 仕様を text/yaml で返す", async () => {
    const req = new Request("http://localhost/openapi.yaml");
    const res = await app.fetch(req, createEnv());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/yaml; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");

    const body = await res.text();
    expect(body).toMatch(/^openapi:\s*3\.1\.0/m);
    expect(body).toContain("Shirabe Calendar API");
    expect(body).toContain("operationId: getCalendarByDate");
    // 本家にのみ x-llm-hint フィールドが含まれる(S9 テンプレ)
    expect(body).toMatch(/^\s*x-llm-hint:/m);
  });
});

describe("GET /openapi-gpts.yaml", () => {
  it("GPTs 向け短縮版 OpenAPI 仕様を text/yaml で返す", async () => {
    const req = new Request("http://localhost/openapi-gpts.yaml");
    const res = await app.fetch(req, createEnv());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/yaml; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");

    const body = await res.text();
    expect(body).toMatch(/^openapi:\s*3\.1\.0/m);
    expect(body).toContain("Shirabe Calendar API");
    expect(body).toContain("operationId: getCalendarByDate");
    expect(body).toContain("operationId: getCalendarRange");
    expect(body).toContain("operationId: getBestDays");
    expect(body).toContain("operationId: getCalendarHealth");
    // 短縮版は x-llm-hint を OpenAPI フィールドとして持たない
    // (ヘッダーコメント内の参照は許容、実フィールドの有無のみを確認)
    expect(body).not.toMatch(/^\s*x-llm-hint:/m);
  });

  it("認証なしでも 200 を返す(ミドルウェア非通過)", async () => {
    const req = new Request("http://localhost/openapi-gpts.yaml");
    const res = await app.fetch(req, createEnv());
    expect(res.status).toBe(200);
  });
});
