/**
 * /openapi-gpts-combined.yaml 配信ルートのスモークテスト。
 *
 * GPT Builder は「同一ドメインに複数 Action」を許可しないため、shirabe.dev の
 * Calendar + Address + Text + Corporation の 4 API を 1 本にまとめた GPTs 短縮版を配信する。
 * 単一 GPT Action に import して 19 operations を 1 つの Hub GPT で扱うための仕様。
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
  it("4 API 結合の GPTs 短縮版を text/yaml で返す", async () => {
    const req = new Request("http://localhost/openapi-gpts-combined.yaml");
    const res = await app.fetch(req, createEnv());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/yaml; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");

    const body = await res.text();
    expect(body).toMatch(/^openapi:\s*3\.1\.0/m);
  });

  it("Calendar / Address / Text / Corporation の代表 operationId を全て含む(計 17)", async () => {
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
      // Corporation
      "corporationLookup",
      "corporationSearch",
      "corporationValidate",
      "corporationNormalize",
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

  it("¥40k 入口 → ¥120k 背骨の flat Hub license 階段を spec に明示(v1.10 = 人間/org 買い手へ再反転)", async () => {
    const req = new Request("http://localhost/openapi-gpts-combined.yaml");
    const res = await app.fetch(req, createEnv());
    const body = await res.text();
    // v1.10: 買い手 = 人間/org。flat Hub license 背骨(¥40k 入口 → ¥120k 背骨)を foreground、
    // per-request は低 volume 入口。AI = discovery(GPT が読み人間/org に推薦 → self-serve 購入)。
    expect(body).toContain("single-API entry");
    expect(body).toContain("cross-API backbone");
    expect(body).toContain("JPY 40,000/mo");
    expect(body).toContain("JPY 120,000/mo");
    expect(body).toContain("Self-serve checkout");
    expect(body).not.toContain("per-request is the default");
  });

  it("全 operation description が GPT Builder の 300 字制限以内", async () => {
    // GPT Builder Actions は operation description が 300 字を超えると import を拒否する。
    // ★ 制限対象は paths: 配下の operation description のみ(components: の schema
    //   description は対象外)。CRLF を除去してから 6 スペース字下げの single-quoted
    //   description を抽出し、paths セクション内のものだけ検査する。
    const req = new Request("http://localhost/openapi-gpts-combined.yaml");
    const res = await app.fetch(req, createEnv());
    const lines = (await res.text()).replace(/\r/g, "").split("\n");
    const over: string[] = [];
    let section = "";
    for (let i = 0; i < lines.length; i++) {
      if (/^[A-Za-z]/.test(lines[i])) section = lines[i].split(":")[0]; // 最上位キー
      if (section !== "paths") continue;
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
