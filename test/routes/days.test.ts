/**
 * T-01 日付別暦情報ページのルーティングテスト
 *
 * 対象:
 * - GET /days/{YYYY-MM-DD}   (正常系 / 境界値)
 * - GET /days/{YYYY-MM-DD}/  (trailing slash)
 * - GET /days/{invalid}      (形式不正 → 400)
 * - GET /days/{out-of-range} (範囲外 → 404)
 */
import { describe, it, expect } from "vitest";
import app from "../../src/index.js";
import { createMockEnv } from "../helpers/mock-kv.js";

async function fetchPath(path: string) {
  const env = createMockEnv();
  const res = await app.fetch(new Request(`http://localhost${path}`), env);
  const body = await res.text();
  return { res, body };
}

describe("GET /days/:date (T-01 day detail SEO page)", () => {
  it("200 を返し、text/html を返す", async () => {
    const { res, body } = await fetchPath("/days/2026-06-15");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<!DOCTYPE html>");
  });

  it("trailing slash (/days/2026-06-15/) でも 200 を返す", async () => {
    const { res, body } = await fetchPath("/days/2026-06-15/");
    expect(res.status).toBe(200);
    expect(body).toContain("<!DOCTYPE html>");
  });

  it("Cache-Control: public, max-age=604800 を設定する(Cloudflare CDN 7 日)", async () => {
    const { res } = await fetchPath("/days/2026-06-15");
    const cache = res.headers.get("cache-control") ?? "";
    expect(cache).toContain("public");
    expect(cache).toContain("max-age=604800");
  });

  it("本文に和暦 / 西暦 / 曜日 / 六曜 / 干支 / 旧暦を含む", async () => {
    const { body } = await fetchPath("/days/2026-06-15");
    expect(body).toContain("2026-06-15");
    expect(body).toContain("令和8年6月15日");
    expect(body).toContain("六曜");
    expect(body).toContain("干支");
    expect(body).toContain("旧暦");
    expect(body).toContain("二十四節気");
  });

  it("JSON-LD: @type: TechArticle と @type: BreadcrumbList を含む", async () => {
    const { body } = await fetchPath("/days/2026-06-15");
    expect(body).toContain('type="application/ld+json"');
    expect(body).toContain('"@type":"TechArticle"');
    expect(body).toContain('"@type":"BreadcrumbList"');
    expect(body).toContain('"headline":');
    expect(body).toContain('"datePublished":');
    expect(body).toContain('"dateModified":');
    expect(body).toContain('"image":');
    expect(body).toContain('"proficiencyLevel":"Beginner"');
    expect(body).toContain('"inLanguage":["ja","en"]');
  });

  it("JSON-LD: Event 型の互換残留がない(startDate/endDate/location 等を含まない)", async () => {
    const { body } = await fetchPath("/days/2026-06-15");
    expect(body).not.toContain('"@type":"Event"');
    expect(body).not.toContain('"startDate"');
    expect(body).not.toContain('"endDate"');
    expect(body).not.toContain('"eventAttendanceMode"');
    expect(body).not.toContain('"eventStatus"');
    expect(body).not.toContain('"VirtualLocation"');
  });

  it("埋め込まれた全 JSON-LD が JSON.parse 可能(構文妥当性)", async () => {
    const { body } = await fetchPath("/days/2026-06-15");
    const matches = Array.from(
      body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
    );
    expect(matches.length).toBeGreaterThanOrEqual(2);
    for (const m of matches) {
      const payload = m[1] ?? "";
      expect(() => JSON.parse(payload)).not.toThrow();
    }
  });

  it("canonical URL と link rel='prev' / 'next' を含む", async () => {
    const { body } = await fetchPath("/days/2026-06-15");
    expect(body).toContain('rel="canonical"');
    expect(body).toContain('href="https://shirabe.dev/days/2026-06-15/"');
    expect(body).toContain('rel="prev"');
    expect(body).toContain('href="https://shirabe.dev/days/2026-06-14/"');
    expect(body).toContain('rel="next"');
    expect(body).toContain('href="https://shirabe.dev/days/2026-06-16/"');
  });

  it("前日 / 翌日 / 同月の代表日への内部リンク網を含む", async () => {
    const { body } = await fetchPath("/days/2026-06-15");
    // 前日 / 翌日
    expect(body).toContain('href="/days/2026-06-14/"');
    expect(body).toContain('href="/days/2026-06-16/"');
    // 同月の代表日(8 日刻み、月初 / 09 / 17 / 25 など自日を除く)
    expect(body).toContain('href="/days/2026-06-01/"');
    expect(body).toContain('href="/days/2026-06-09/"');
  });

  it("API curl 例(shirabe.dev/api/v1/calendar/{date})を含む", async () => {
    const { body } = await fetchPath("/days/2026-06-15");
    expect(body).toContain("https://shirabe.dev/api/v1/calendar/2026-06-15");
    expect(body).toContain("curl");
  });

  it("OpenAPI / MCP / GPT Store / llms.txt への誘導リンクを含む", async () => {
    const { body } = await fetchPath("/days/2026-06-15");
    expect(body).toContain("https://shirabe.dev/openapi.yaml");
    expect(body).toContain("https://shirabe.dev/mcp");
    expect(body).toContain("chatgpt.com/g/g-69e98031");
    expect(body).toContain('href="https://shirabe.dev/llms.txt"');
  });

  it("meta keywords と OG / Twitter メタタグを含む", async () => {
    const { body } = await fetchPath("/days/2026-06-15");
    expect(body).toContain('name="keywords"');
    expect(body).toContain('property="og:type"');
    expect(body).toContain('property="og:title"');
    expect(body).toContain('name="twitter:card"');
    expect(body).toContain("2026年6月15日");
  });

  it("月末 (2026-06-30) から翌日 (2026-07-01) への月またぎリンクが正しい", async () => {
    const { body } = await fetchPath("/days/2026-06-30");
    expect(body).toContain('href="/days/2026-07-01/"'); // 翌日
    expect(body).toContain('href="/days/2026-06-29/"'); // 前日
  });

  it("年またぎ (2026-12-31 → 2027-01-01) でも前日/翌日が正しい", async () => {
    const { body } = await fetchPath("/days/2026-12-31");
    expect(body).toContain('href="/days/2027-01-01/"');
    expect(body).toContain('href="/days/2026-12-30/"');
  });
});

describe("GET /days/:date — 境界値", () => {
  it("下限 (1873-01-01) は 200 を返す", async () => {
    const { res } = await fetchPath("/days/1873-01-01");
    expect(res.status).toBe(200);
  });

  it("上限 (2100-12-31) は 200 を返す", async () => {
    const { res } = await fetchPath("/days/2100-12-31");
    expect(res.status).toBe(200);
  });
});

describe("GET /days/:date — バリデーションエラー", () => {
  it("日付形式不正 (2026-13-99) は 400 text/plain", async () => {
    const { res, body } = await fetchPath("/days/2026-13-99");
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(body).toContain("Invalid date format");
    expect(body).toContain("YYYY-MM-DD");
  });

  it("非日付文字列 (foo) は 400 text/plain", async () => {
    const { res } = await fetchPath("/days/foo");
    expect(res.status).toBe(400);
  });

  it("日付形式は正しいが範囲外 (3000-01-01) は 404 text/plain", async () => {
    const { res, body } = await fetchPath("/days/3000-01-01");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(body).toContain("out of supported range");
    expect(body).toContain("1873-01-01 to 2100-12-31");
  });

  it("日付形式は正しいが下限より過去 (1800-01-01) は 404", async () => {
    const { res } = await fetchPath("/days/1800-01-01");
    expect(res.status).toBe(404);
  });

  it("存在しない日 (2026-02-30) は 400(parseDate が拒否)", async () => {
    const { res } = await fetchPath("/days/2026-02-30");
    expect(res.status).toBe(400);
  });

  it("認証ミドルウェアをバイパスする(401 にならない)", async () => {
    const { res } = await fetchPath("/days/2026-06-15");
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
  });
});
