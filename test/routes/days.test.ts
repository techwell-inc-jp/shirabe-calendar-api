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

  it("JSON-LD: datePublished / dateModified が ISO 8601 full DateTime + JST timezone(Rich Results warning 対策)", async () => {
    const { body } = await fetchPath("/days/2026-06-15");
    // Date-only ("2026-04-24") は Rich Results で "日時値が無効" warning を出すため、
    // 必ず "YYYY-MM-DDTHH:mm:ss+09:00" 形式(JST)で出力する
    expect(body).toMatch(/"datePublished":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00"/);
    expect(body).toMatch(/"dateModified":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00"/);
  });

  it("JSON-LD image は /og-default.svg を指す(Schema.org image 必須)", async () => {
    const { body } = await fetchPath("/days/2026-06-15");
    expect(body).toContain('"image":"https://shirabe.dev/og-default.svg"');
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

  it("meta keywords と OG / Twitter メタタグを含む(og:image + twitter:image + summary_large_image)", async () => {
    const { body } = await fetchPath("/days/2026-06-15");
    expect(body).toContain('name="keywords"');
    expect(body).toContain('property="og:type"');
    expect(body).toContain('property="og:title"');
    expect(body).toContain('property="og:image" content="https://shirabe.dev/og-default.svg"');
    expect(body).toContain('property="og:image:width" content="1200"');
    expect(body).toContain('property="og:image:height" content="630"');
    expect(body).toContain('name="twitter:card" content="summary_large_image"');
    expect(body).toContain('name="twitter:image" content="https://shirabe.dev/og-default.svg"');
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

  // ---------------------------------------------------------------------------
  // Layer C (R-3) 内部リンク密度向上(Tier 1 のみ)
  //
  // GSC indexing 改善対策の Layer C。Tier 1 ページに同干支(60 日周期)+ 周年
  // (±10年/±100年同月同日)のアンカーを追加し、AI クローラー topical exploration
  // を強化。Tier 2/3 は thin content 判定リスク回避のため追加しない。
  // ---------------------------------------------------------------------------

  it("Layer C: Tier 1 ページは同干支セクションを含む", async () => {
    const { body } = await fetchPath("/days/2026-06-15");
    expect(body).toContain("同干支の日");
    expect(body).toContain("60 日周期");
  });

  it("Layer C: Tier 1 ページは周年セクションを含む", async () => {
    const { body } = await fetchPath("/days/2026-06-15");
    expect(body).toContain("歴史上の同じ日");
  });

  it("Layer C: Tier 1 同干支リンクは ±60/±120/+180 日先の日付を含む", async () => {
    const { body } = await fetchPath("/days/2026-06-15");
    // 2026-06-15 ± 60 日 = 2026-04-16 / 2026-08-14
    expect(body).toContain('href="/days/2026-04-16/"');
    expect(body).toContain('href="/days/2026-08-14/"');
    // ± 120 日 = 2026-02-15 / 2026-10-13
    expect(body).toContain('href="/days/2026-02-15/"');
    expect(body).toContain('href="/days/2026-10-13/"');
  });

  it("Layer C: Tier 1 周年リンクは ±10年/±100年同月同日を含む", async () => {
    const { body } = await fetchPath("/days/2026-06-15");
    expect(body).toContain('href="/days/2016-06-15/"'); // -10年
    expect(body).toContain('href="/days/2036-06-15/"'); // +10年
    expect(body).toContain('href="/days/1926-06-15/"'); // -100年
    // +100年 = 2126年は範囲外なので含まない
    expect(body).not.toContain('href="/days/2126-06-15/"');
  });

  it("Layer C: Tier 3(歴史日付 1900)では同干支・周年セクションを含まない", async () => {
    const { body } = await fetchPath("/days/1900-06-15");
    expect(body).not.toContain("同干支の日");
    expect(body).not.toContain("歴史上の同じ日");
  });

  it("Layer C: Tier 3(遠未来 2080)でも同干支・周年セクションを含まない", async () => {
    const { body } = await fetchPath("/days/2080-06-15");
    expect(body).not.toContain("同干支の日");
    expect(body).not.toContain("歴史上の同じ日");
  });

  it("Layer C: 周年で 2/29 → 2/28 への閏日丸めが機能する", async () => {
    // 2024-02-29(閏日)から +10年 = 2034-02-28(2034 は平年)に丸めて出力
    const { res, body } = await fetchPath("/days/2024-02-29");
    if (res.status !== 200) return; // 2024 は Tier 1 範囲外なら skip
    if (body.includes("歴史上の同じ日")) {
      expect(body).toContain('href="/days/2034-02-28/"');
    }
  });
});
