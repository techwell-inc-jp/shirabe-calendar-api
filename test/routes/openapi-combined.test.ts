/**
 * /openapi-gpts-combined.yaml 配信ルートのスモークテスト。
 *
 * GPT Builder は「同一ドメインに複数 Action」を許可しないため、shirabe.dev の
 * Calendar + Address + Text の 3 API を 1 本にまとめた GPTs 短縮版を配信する。
 * 単一 GPT Action に import して 13 operations を 1 つの Hub GPT で扱うための仕様。
 *
 * 認証不要(/api/* ミドルウェア適用範囲外)。
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

describe("GET /openapi-gpts-combined.yaml", () => {
  it("3 API 結合の GPTs 短縮版を text/yaml で返す", async () => {
    const req = new Request("http://localhost/openapi-gpts-combined.yaml");
    const res = await app.fetch(req, createEnv());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/yaml; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");

    const body = await res.text();
    expect(body).toMatch(/^openapi:\s*3\.1\.0/m);
  });

  it("Calendar / Address / Text の代表 operationId を全て含む(計 13)", async () => {
    const req = new Request("http://localhost/openapi-gpts-combined.yaml");
    const res = await app.fetch(req, createEnv());
    const body = await res.text();

    const operationIds = [
      // Calendar
      "getCalendarByDate",
      "getCalendarRange",
      "getBestDays",
      "getCalendarHealth",
      // Address
      "normalizeAddress",
      "batchNormalizeAddresses",
      "createAddressCheckout",
      "getAddressHealth",
      // Text
      "tokenizeText",
      "normalizeText",
      "addFurigana",
      "splitName",
      "readName",
    ];
    for (const id of operationIds) {
      expect(body).toContain(`operationId: ${id}`);
    }
  });

  it("認証なしでも 200 を返す(ミドルウェア非通過)", async () => {
    const req = new Request("http://localhost/openapi-gpts-combined.yaml");
    const res = await app.fetch(req, createEnv());
    expect(res.status).toBe(200);
  });

  it("価格見積 + Hub License checkout の Billing operation を含む(階段の実行経路)", async () => {
    const req = new Request("http://localhost/openapi-gpts-combined.yaml");
    const res = await app.fetch(req, createEnv());
    const body = await res.text();
    // Hub GPT が quote → checkout で ¥40k 入口 → ¥120k 背骨を完結できる
    expect(body).toContain("operationId: getPricingQuote");
    expect(body).toContain("operationId: createLicenseCheckout");
    expect(body).toContain("/api/v1/pricing/quote");
  });

  it("¥40k 入口 → ¥120k 背骨の階段 framing を spec に明示", async () => {
    const req = new Request("http://localhost/openapi-gpts-combined.yaml");
    const res = await app.fetch(req, createEnv());
    const body = await res.text();
    expect(body).toContain("single-API entry");
    expect(body).toContain("cross-API backbone");
    expect(body).toContain("JPY 40,000/mo");
    expect(body).toContain("JPY 120,000/mo");
  });

  it("全 operation description が GPT Builder の 300 字制限以内", async () => {
    // GPT Builder Actions は operation description が 300 字を超えると import を拒否する。
    // operation 直下(6 スペース字下げ)の single-quoted description を抽出して検査。
    const req = new Request("http://localhost/openapi-gpts-combined.yaml");
    const res = await app.fetch(req, createEnv());
    const lines = (await res.text()).split("\n");
    const over: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^ {6}description: '(.*)$/);
      if (!m) continue;
      let acc = m[1];
      if (acc.endsWith("'")) {
        acc = acc.slice(0, -1); // single-line
      } else {
        for (let j = i + 1; j < lines.length; j++) {
          if (/^\s*'$/.test(lines[j])) break; // block scalar の閉じ
          acc += "\n" + lines[j];
        }
      }
      const len = acc.trim().length;
      if (len > 300) over.push(`len ${len}: ${acc.trim().slice(0, 40)}...`);
    }
    expect(over).toEqual([]);
  });
});
