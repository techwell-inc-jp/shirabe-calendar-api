/**
 * T-04: サイトマップ大規模化のテスト
 *
 * - sitemap.xml が sitemapindex 形式になっている
 * - /sitemap-docs.xml / /sitemap-days-{1..4}.xml が正しい urlset を返す
 * - helpers の pure function は独立してユニットテスト
 * - 既存 /sitemap.xml テストとの互換(index 化で内容が変わる点はテスト更新)
 */
import { describe, it, expect } from "vitest";
import app from "../../src/index.js";
import { createMockEnv } from "../helpers/mock-kv.js";
import {
  daysInMonth,
  enumerateDateRange,
  generateDaysSitemapBody,
  generateDocsSitemapBody,
  generateSitemapIndex,
  DOCS_SITEMAP_PAGES,
  SUB_SITEMAPS,
} from "../../src/routes/sitemap-helpers.js";

async function fetchPath(path: string) {
  const env = createMockEnv();
  const res = await app.fetch(new Request(`http://localhost${path}`), env);
  const body = await res.text();
  return { res, body };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("daysInMonth (helper)", () => {
  it("2026-01 は 31 日", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
  });
  it("2026-02 は 28 日(非閏年)", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
  });
  it("2024-02 は 29 日(閏年)", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
  });
  it("2000-02 は 29 日(400 で割れる閏年)", () => {
    expect(daysInMonth(2000, 2)).toBe(29);
  });
  it("1900-02 は 28 日(100 で割れるが 400 では割れない → 非閏年)", () => {
    expect(daysInMonth(1900, 2)).toBe(28);
  });
  it("2026-04 は 30 日", () => {
    expect(daysInMonth(2026, 4)).toBe(30);
  });
});

describe("enumerateDateRange (helper)", () => {
  it("単年 (2026) は 365 日", () => {
    expect(enumerateDateRange(2026, 2026).length).toBe(365);
  });
  it("単年 (2024、閏年) は 366 日", () => {
    expect(enumerateDateRange(2024, 2024).length).toBe(366);
  });
  it("先頭 / 末尾が正しい形式", () => {
    const dates = enumerateDateRange(2026, 2026);
    expect(dates[0]).toBe("2026-01-01");
    expect(dates[dates.length - 1]).toBe("2026-12-31");
  });
  it("2 年分は連続している", () => {
    const dates = enumerateDateRange(2025, 2026);
    expect(dates.length).toBe(365 + 365);
    expect(dates[364]).toBe("2025-12-31");
    expect(dates[365]).toBe("2026-01-01");
  });
  it("T-04 の各サブ範囲のサイズが 50,000 URL 上限内", () => {
    // days-1: 1873-1949 (77 年)
    expect(enumerateDateRange(1873, 1949).length).toBeLessThan(50000);
    // days-2: 1950-1999 (50 年)
    expect(enumerateDateRange(1950, 1999).length).toBeLessThan(50000);
    // days-3: 2000-2049 (50 年)
    expect(enumerateDateRange(2000, 2049).length).toBeLessThan(50000);
    // days-4: 2050-2100 (51 年)
    expect(enumerateDateRange(2050, 2100).length).toBeLessThan(50000);
  });
});

describe("generateDaysSitemapBody (helper)", () => {
  it("urlset + 正しいヘッダー + 日付別 URL", () => {
    const body = generateDaysSitemapBody(2026, 2026, "2026-04-24");
    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(body).toContain("<loc>https://shirabe.dev/days/2026-01-01/</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/days/2026-12-31/</loc>");
    expect(body).toContain("<lastmod>2026-04-24</lastmod>");
    expect(body).toContain("<changefreq>yearly</changefreq>");
    expect(body).toContain("<priority>0.5</priority>");
  });

  it("2 年 range でも先頭・末尾が正しい", () => {
    const body = generateDaysSitemapBody(2024, 2025, "2026-04-24");
    expect(body).toContain("<loc>https://shirabe.dev/days/2024-01-01/</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/days/2024-02-29/</loc>"); // 閏年
    expect(body).toContain("<loc>https://shirabe.dev/days/2025-12-31/</loc>");
  });
});

describe("generateDocsSitemapBody (helper)", () => {
  it("主要 docs URL を全て含む", () => {
    const body = generateDocsSitemapBody("2026-04-24");
    expect(body).toContain("<loc>https://shirabe.dev/</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/docs/rokuyo-api</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/docs/rekichu-api</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/docs/address-normalize</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/openapi.yaml</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/llms.txt</loc>");
  });
  it("priority / changefreq / lastmod を全エントリに設定", () => {
    const body = generateDocsSitemapBody("2026-04-24");
    expect(body).toContain("<priority>1.0</priority>");
    expect(body).toContain("<changefreq>weekly</changefreq>");
    expect(body).toContain("<lastmod>2026-04-24</lastmod>");
  });
});

describe("generateSitemapIndex (helper)", () => {
  it("sitemapindex + 6 つの sub-sitemap 参照を含む(docs + days-1..4 + purposes)", () => {
    const body = generateSitemapIndex(
      SUB_SITEMAPS.map((s) => s.path),
      "2026-04-24"
    );
    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain(
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    );
    expect(body).toContain("<loc>https://shirabe.dev/sitemap-docs.xml</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/sitemap-days-1.xml</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/sitemap-days-2.xml</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/sitemap-days-3.xml</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/sitemap-days-4.xml</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/sitemap-purposes.xml</loc>");
  });
});

describe("DOCS_SITEMAP_PAGES (config)", () => {
  it("暦 docs / 住所 docs / OpenAPI / llms.txt を全て含む", () => {
    const urls = DOCS_SITEMAP_PAGES.map((p) => p.loc);
    expect(urls).toContain("https://shirabe.dev/");
    expect(urls).toContain("https://shirabe.dev/docs/rokuyo-api");
    expect(urls).toContain("https://shirabe.dev/docs/rekichu-api");
    expect(urls).toContain("https://shirabe.dev/docs/address-normalize");
    expect(urls).toContain("https://shirabe.dev/docs/address-batch");
    expect(urls).toContain("https://shirabe.dev/docs/address-pricing");
    expect(urls).toContain("https://shirabe.dev/openapi.yaml");
    expect(urls).toContain("https://shirabe.dev/api/v1/address/openapi.yaml");
    expect(urls).toContain("https://shirabe.dev/llms.txt");
    expect(urls).toContain("https://shirabe.dev/api/v1/address/llms.txt");
  });
  it("/purposes/ index ページを含む(T-02)", () => {
    const urls = DOCS_SITEMAP_PAGES.map((p) => p.loc);
    expect(urls).toContain("https://shirabe.dev/purposes/");
  });
});

// ---------------------------------------------------------------------------
// HTTP endpoints
// ---------------------------------------------------------------------------

describe("GET /sitemap.xml (T-04 + T-02: sitemap index)", () => {
  it("200 + application/xml、sitemapindex を返す", async () => {
    const { res, body } = await fetchPath("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain("<sitemapindex");
  });

  it("6 つのサブサイトマップを参照する(docs + days-1..4 + purposes)", async () => {
    const { body } = await fetchPath("/sitemap.xml");
    expect(body).toContain("<loc>https://shirabe.dev/sitemap-docs.xml</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/sitemap-days-1.xml</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/sitemap-days-2.xml</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/sitemap-days-3.xml</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/sitemap-days-4.xml</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/sitemap-purposes.xml</loc>");
  });

  it("各 sitemap エントリに lastmod 属性が付く", async () => {
    const { body } = await fetchPath("/sitemap.xml");
    const lastmodMatches = body.match(/<lastmod>/g);
    expect(lastmodMatches).not.toBeNull();
    expect((lastmodMatches ?? []).length).toBeGreaterThanOrEqual(6);
  });
});

describe("GET /sitemap-docs.xml (T-04)", () => {
  it("200 + urlset を返し、docs 系 URL を含む", async () => {
    const { res, body } = await fetchPath("/sitemap-docs.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
    expect(body).toContain("<urlset");
    expect(body).toContain("<loc>https://shirabe.dev/docs/rokuyo-api</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/openapi.yaml</loc>");
  });
});

describe("GET /sitemap-days-{1..4}.xml (T-04)", () => {
  it("/sitemap-days-1.xml は 1873-1949 の URL(70K 以上)を含む", async () => {
    const { res, body } = await fetchPath("/sitemap-days-1.xml");
    expect(res.status).toBe(200);
    expect(body).toContain("<loc>https://shirabe.dev/days/1873-01-01/</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/days/1949-12-31/</loc>");
  });

  it("/sitemap-days-2.xml は 1950-1999 の URL を含む", async () => {
    const { body } = await fetchPath("/sitemap-days-2.xml");
    expect(body).toContain("<loc>https://shirabe.dev/days/1950-01-01/</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/days/1999-12-31/</loc>");
  });

  it("/sitemap-days-3.xml は 2000-2049 の URL を含む(閏年 2024-02-29 確認)", async () => {
    const { body } = await fetchPath("/sitemap-days-3.xml");
    expect(body).toContain("<loc>https://shirabe.dev/days/2000-01-01/</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/days/2024-02-29/</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/days/2049-12-31/</loc>");
  });

  it("/sitemap-days-4.xml は 2050-2100 の URL を含む", async () => {
    const { body } = await fetchPath("/sitemap-days-4.xml");
    expect(body).toContain("<loc>https://shirabe.dev/days/2050-01-01/</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/days/2100-12-31/</loc>");
  });

  it("各 days サイトマップの Cache-Control は 24h 以上", async () => {
    const { res } = await fetchPath("/sitemap-days-2.xml");
    const cache = res.headers.get("cache-control") ?? "";
    expect(cache).toContain("public");
    // max-age は 86400 (24h) 以上
    const match = cache.match(/max-age=(\d+)/);
    expect(match).not.toBeNull();
    expect(parseInt(match?.[1] ?? "0", 10)).toBeGreaterThanOrEqual(86400);
  });
});
