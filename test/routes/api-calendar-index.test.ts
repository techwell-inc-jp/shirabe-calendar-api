/**
 * /api/v1/calendar/ Index Page (404 修正、PR #35)テスト
 *
 * 対象:
 * - GET /api/v1/calendar       (末尾スラッシュなし)
 * - GET /api/v1/calendar/      (末尾スラッシュあり)
 * - 既存 /api/v1/calendar/{date} (regression check)
 * - 既存 /api/v1/calendar/range  (regression check)
 * - 既存 /api/v1/calendar/best-days (regression check)
 *
 * GSC「クロール済み・404」1 件の解消 + AI agents 向け endpoint discovery surface
 * 格上げの検証。
 */
import { describe, it, expect } from "vitest";
import app from "../../src/index.js";
import { createMockEnv } from "../helpers/mock-kv.js";
import { renderApiCalendarIndexPage } from "../../src/pages/api-calendar-index.js";

async function fetchPath(path: string) {
  const env = createMockEnv();
  const res = await app.fetch(new Request(`http://localhost${path}`), env);
  const body = await res.text();
  return { res, body };
}

// ---------------------------------------------------------------------------
// pure function: renderApiCalendarIndexPage
// ---------------------------------------------------------------------------

describe("renderApiCalendarIndexPage (pure render)", () => {
  it("HTML5 doctype + 日本語 lang を返す", () => {
    const html = renderApiCalendarIndexPage();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="ja"');
  });

  it("title に Shirabe Calendar API + Endpoint Index を含む", () => {
    const html = renderApiCalendarIndexPage();
    expect(html).toMatch(/<title>Shirabe Calendar API.*Endpoint Index/);
  });

  it("canonical URL が /api/v1/calendar/ を指す", () => {
    const html = renderApiCalendarIndexPage();
    expect(html).toContain('rel="canonical" href="https://shirabe.dev/api/v1/calendar/"');
  });

  it("3 endpoints (date / range / best-days) を全て掲載", () => {
    const html = renderApiCalendarIndexPage();
    expect(html).toContain("/api/v1/calendar/{date}");
    expect(html).toContain("/api/v1/calendar/range");
    expect(html).toContain("/api/v1/calendar/best-days");
  });

  it("認証情報 (X-API-Key) と Free 枠 10,000 回/月の説明を含む", () => {
    const html = renderApiCalendarIndexPage();
    expect(html).toContain("X-API-Key");
    expect(html).toContain("10,000");
  });

  it("料金プラン 4 種(Free/Starter/Pro/Enterprise)を全て掲載", () => {
    const html = renderApiCalendarIndexPage();
    expect(html).toContain("Free");
    expect(html).toContain("Starter");
    expect(html).toContain("Pro");
    expect(html).toContain("Enterprise");
  });

  it("AI 統合経路 5 種(GPTs/MCP/Gemini/LangChain/llms.txt)を全て言及", () => {
    const html = renderApiCalendarIndexPage();
    expect(html).toContain("GPTs Actions");
    expect(html).toContain("MCP");
    expect(html).toContain("Function Calling");
    expect(html).toContain("LangChain");
    expect(html).toContain("/llms.txt");
  });
});

describe("renderApiCalendarIndexPage — JSON-LD structured data", () => {
  it("WebAPI JSON-LD を含む", () => {
    const html = renderApiCalendarIndexPage();
    expect(html).toContain('"@type":"WebAPI"');
    expect(html).toContain('"name":"Shirabe Calendar API"');
  });

  it("WebAPI JSON-LD に provider Organization と documentation URL を含む", () => {
    const html = renderApiCalendarIndexPage();
    expect(html).toContain('"@type":"Organization"');
    expect(html).toContain('"documentation":"https://shirabe.dev/openapi.yaml"');
  });

  it("WebAPI potentialAction に 3 endpoints の EntryPoint を含む", () => {
    const html = renderApiCalendarIndexPage();
    expect(html).toContain('"@type":"ConsumeAction"');
    expect(html).toContain('"@type":"EntryPoint"');
    expect(html).toContain("urlTemplate");
    // 3 endpoints それぞれの urlTemplate
    expect(html).toContain("/api/v1/calendar/{date}");
    expect(html).toContain("/api/v1/calendar/range?");
    expect(html).toContain("/api/v1/calendar/best-days?purpose=");
  });

  it("FAQPage JSON-LD を含む(6 質問以上)", () => {
    const html = renderApiCalendarIndexPage();
    expect(html).toContain('"@type":"FAQPage"');
    const questionCount = (html.match(/"@type":"Question"/g) ?? []).length;
    expect(questionCount).toBeGreaterThanOrEqual(6);
  });

  it("FAQ に主要トピック(エンドポイント/認証/AI 統合/日付範囲/用途別/出典)を含む", () => {
    const html = renderApiCalendarIndexPage();
    expect(html).toMatch(/エンドポイント/);
    expect(html).toMatch(/認証/);
    expect(html).toMatch(/AI/);
    expect(html).toMatch(/日付範囲/);
    expect(html).toMatch(/用途/);
    expect(html).toMatch(/出典|信頼性/);
  });

  it("BreadcrumbList JSON-LD を含む(階層 2 段)", () => {
    const html = renderApiCalendarIndexPage();
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('"name":"Shirabe"');
    expect(html).toContain('"name":"Calendar API"');
  });
});

// ---------------------------------------------------------------------------
// HTTP routes
// ---------------------------------------------------------------------------

describe("GET /api/v1/calendar (no trailing slash)", () => {
  it("200 を返し、HTML を返す(GSC 404 解消)", async () => {
    const { res, body } = await fetchPath("/api/v1/calendar");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<!DOCTYPE html>");
    expect(body).toContain("Endpoint Index");
  });

  it("Cache-Control max-age=86400 を返す(Cloudflare CDN 24h cache)", async () => {
    const { res } = await fetchPath("/api/v1/calendar");
    expect(res.headers.get("cache-control")).toContain("max-age=86400");
  });

  it("WebAPI / FAQPage JSON-LD を含む", async () => {
    const { body } = await fetchPath("/api/v1/calendar");
    expect(body).toContain('"@type":"WebAPI"');
    expect(body).toContain('"@type":"FAQPage"');
  });
});

describe("GET /api/v1/calendar/ (with trailing slash)", () => {
  it("200 を返し、HTML を返す(GSC 404 解消)", async () => {
    const { res, body } = await fetchPath("/api/v1/calendar/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("Endpoint Index");
  });

  it("末尾スラッシュ版とスラッシュなし版で同一 body を返す", async () => {
    const a = await fetchPath("/api/v1/calendar");
    const b = await fetchPath("/api/v1/calendar/");
    expect(a.body).toBe(b.body);
  });
});

describe("既存 endpoints regression check", () => {
  it("GET /api/v1/calendar/2026-06-15 は引き続き calendar API として動作", async () => {
    const { res, body } = await fetchPath("/api/v1/calendar/2026-06-15");
    expect(res.status).toBe(200);
    // calendar API は JSON 応答(rokuyo / rekichu / context 等)
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = JSON.parse(body) as { date: string; rokuyo: { name: string } };
    expect(json.date).toBe("2026-06-15");
    expect(json.rokuyo.name).toBeDefined();
  });

  it("GET /api/v1/calendar/range は引き続き 400(start/end query 必須)", async () => {
    const { res } = await fetchPath("/api/v1/calendar/range");
    // start/end が無いと INVALID_PARAMETER 400 を返す既存仕様
    expect(res.status).toBe(400);
  });

  it("GET /api/v1/calendar/range?start=2026-06-01&end=2026-06-03 は 200 を返す", async () => {
    const { res, body } = await fetchPath(
      "/api/v1/calendar/range?start=2026-06-01&end=2026-06-03"
    );
    expect(res.status).toBe(200);
    const json = JSON.parse(body) as { dates: unknown[] };
    expect(Array.isArray(json.dates)).toBe(true);
  });

  it("GET /api/v1/calendar/best-days?purpose=wedding&start=...&end=... は 200 を返す", async () => {
    const { res, body } = await fetchPath(
      "/api/v1/calendar/best-days?purpose=wedding&start=2026-06-01&end=2026-06-30"
    );
    expect(res.status).toBe(200);
    const json = JSON.parse(body) as { best_days: unknown[] };
    expect(Array.isArray(json.best_days)).toBe(true);
  });
});
