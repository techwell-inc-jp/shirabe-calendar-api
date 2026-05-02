/**
 * T-02 用途別月間ランキングページ + sitemap-purposes のテスト
 *
 * 対象:
 * - GET /purposes/                            (28 カテゴリ index)
 * - GET /purposes/{slug}/{YYYY-MM}            (正常系 / 境界値、trailing slash 両対応)
 * - GET /purposes/{slug}/{invalid-ym}         (形式不正 → 400)
 * - GET /purposes/{slug}/{out-of-range-ym}    (範囲外 → 404)
 * - GET /purposes/{unknown-slug}/{ym}         (未知 slug → 404)
 * - GET /sitemap-purposes.xml                 (T-02 + T-04 連携)
 * - data/purposes-map.ts の pure functions
 *
 * Day 1 受入条件: ≥ 20 tests 追加(実装指示書 T-02 完了条件)
 */
import { describe, it, expect } from "vitest";
import app from "../../src/index.js";
import { createMockEnv } from "../helpers/mock-kv.js";
import {
  PURPOSE_CATEGORIES,
  PURPOSES_MAX_YEAR,
  PURPOSES_MIN_YEAR,
  enumerateAllPurposeUrls,
  findPurposeBySlug,
  isYearMonthInRange,
  parseYearMonth,
  shiftYearMonth,
} from "../../src/data/purposes-map.js";
import { generatePurposesSitemapBody } from "../../src/routes/sitemap-helpers.js";

async function fetchPath(path: string) {
  const env = createMockEnv();
  const res = await app.fetch(new Request(`http://localhost${path}`), env);
  const body = await res.text();
  return { res, body };
}

// ---------------------------------------------------------------------------
// Pure helpers (data/purposes-map.ts)
// ---------------------------------------------------------------------------

describe("PURPOSE_CATEGORIES (T-02 28 SEO カテゴリ定義)", () => {
  it("ちょうど 28 種類定義されている", () => {
    expect(PURPOSE_CATEGORIES.length).toBe(28);
  });

  it("全カテゴリの slug が一意で kebab-case", () => {
    const slugs = PURPOSE_CATEGORIES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("全カテゴリが既存 8 API カテゴリのいずれかにマップされる", () => {
    const validApi = new Set([
      "wedding",
      "funeral",
      "moving",
      "construction",
      "business",
      "car_delivery",
      "marriage_registration",
      "travel",
    ]);
    for (const p of PURPOSE_CATEGORIES) {
      expect(validApi.has(p.apiCategory)).toBe(true);
    }
  });

  it("削除候補 4 種(賭け事・離婚・和解・謝罪)は含まない", () => {
    const displayNames = PURPOSE_CATEGORIES.map((p) => p.displayJa);
    expect(displayNames).not.toContain("賭け事");
    expect(displayNames).not.toContain("離婚");
    expect(displayNames).not.toContain("和解");
    expect(displayNames).not.toContain("謝罪");
  });

  it("ファジーマッピング: 厄払い・七五三・神事 → wedding、ペット → moving、受験 → business", () => {
    const lookup = (ja: string) =>
      PURPOSE_CATEGORIES.find((p) => p.displayJa === ja)?.apiCategory;
    expect(lookup("厄払い")).toBe("wedding");
    expect(lookup("七五三")).toBe("wedding");
    expect(lookup("神事")).toBe("wedding");
    expect(lookup("ペット")).toBe("moving");
    expect(lookup("受験")).toBe("business");
  });
});

describe("findPurposeBySlug (helper)", () => {
  it("既存 slug は entry を返す", () => {
    expect(findPurposeBySlug("wedding-ceremony")?.displayJa).toBe("結婚式");
    expect(findPurposeBySlug("marriage-registration")?.displayJa).toBe("入籍");
    expect(findPurposeBySlug("moving")?.apiCategory).toBe("moving");
  });

  it("未知 slug は null", () => {
    expect(findPurposeBySlug("unknown-purpose")).toBeNull();
    expect(findPurposeBySlug("")).toBeNull();
  });
});

describe("parseYearMonth / isYearMonthInRange (helpers)", () => {
  it("正常な YYYY-MM をパース", () => {
    expect(parseYearMonth("2026-06")).toEqual([2026, 6]);
    expect(parseYearMonth("2010-01")).toEqual([2010, 1]);
    expect(parseYearMonth("2034-12")).toEqual([2034, 12]);
  });

  it("形式不正は null", () => {
    expect(parseYearMonth("2026-13")).toBeNull(); // month > 12
    expect(parseYearMonth("2026-00")).toBeNull(); // month < 1
    expect(parseYearMonth("2026/06")).toBeNull(); // separator 違い
    expect(parseYearMonth("2026-6")).toBeNull(); // 月が 1 桁
    expect(parseYearMonth("foo")).toBeNull();
  });

  it("対応範囲(2010-01 〜 2034-12)の境界判定", () => {
    expect(isYearMonthInRange(2010, 1)).toBe(true);
    expect(isYearMonthInRange(2034, 12)).toBe(true);
    expect(isYearMonthInRange(2009, 12)).toBe(false);
    expect(isYearMonthInRange(2035, 1)).toBe(false);
    expect(PURPOSES_MIN_YEAR).toBe(2010);
    expect(PURPOSES_MAX_YEAR).toBe(2034);
  });
});

describe("shiftYearMonth (helper)", () => {
  it("通常月は ±1 で月だけ変わる", () => {
    expect(shiftYearMonth(2026, 6, -1)).toEqual({ year: 2026, month: 5, ym: "2026-05" });
    expect(shiftYearMonth(2026, 6, 1)).toEqual({ year: 2026, month: 7, ym: "2026-07" });
  });

  it("年またぎ(1月→前月12月、12月→翌月1月)", () => {
    expect(shiftYearMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12, ym: "2025-12" });
    expect(shiftYearMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1, ym: "2027-01" });
  });

  it("対応範囲外は null", () => {
    expect(shiftYearMonth(2010, 1, -1)).toBeNull(); // 2009-12
    expect(shiftYearMonth(2034, 12, 1)).toBeNull(); // 2035-01
  });
});

describe("enumerateAllPurposeUrls (helper)", () => {
  it("28 cats × 25 年 × 12 月 = 8,400 URL を返す", () => {
    expect(enumerateAllPurposeUrls().length).toBe(28 * 25 * 12);
    expect(enumerateAllPurposeUrls().length).toBe(8400);
  });

  it("先頭・末尾が範囲境界と一致", () => {
    const all = enumerateAllPurposeUrls();
    const first = all[0];
    const last = all[all.length - 1];
    expect(first.year).toBe(PURPOSES_MIN_YEAR);
    expect(last.year).toBe(PURPOSES_MAX_YEAR);
  });
});

// ---------------------------------------------------------------------------
// HTTP: /purposes/ index
// ---------------------------------------------------------------------------

describe("GET /purposes/ (T-02 28 カテゴリ index)", () => {
  it("200 + text/html を返す", async () => {
    const { res, body } = await fetchPath("/purposes/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<!DOCTYPE html>");
  });

  it("28 カテゴリ全ての日本語表示名を含む(代表 6 件で確認)", async () => {
    const { body } = await fetchPath("/purposes/");
    expect(body).toContain("結婚式");
    expect(body).toContain("引越し");
    expect(body).toContain("開業");
    expect(body).toContain("七五三");
    expect(body).toContain("地鎮祭");
    expect(body).toContain("プロポーズ");
  });

  it("JSON-LD: TechArticle + ItemList(28 entries) + BreadcrumbList を含む", async () => {
    const { body } = await fetchPath("/purposes/");
    expect(body).toContain('"@type":"TechArticle"');
    expect(body).toContain('"@type":"ItemList"');
    expect(body).toContain('"@type":"BreadcrumbList"');
    expect(body).toContain('"numberOfItems":28');
  });

  it("canonical URL を含む", async () => {
    const { body } = await fetchPath("/purposes/");
    expect(body).toContain('rel="canonical"');
    expect(body).toContain('href="https://shirabe.dev/purposes/"');
  });
});

// ---------------------------------------------------------------------------
// HTTP: /purposes/{slug}/{YYYY-MM}
// ---------------------------------------------------------------------------

describe("GET /purposes/:slug/:ym (T-02 用途別月間ランキング)", () => {
  it("200 + text/html、Cache-Control: public, max-age=604800", async () => {
    const { res, body } = await fetchPath("/purposes/wedding-ceremony/2026-06");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<!DOCTYPE html>");
    const cache = res.headers.get("cache-control") ?? "";
    expect(cache).toContain("public");
    expect(cache).toContain("max-age=604800");
  });

  it("trailing slash (/purposes/wedding-ceremony/2026-06/) でも 200", async () => {
    const { res } = await fetchPath("/purposes/wedding-ceremony/2026-06/");
    expect(res.status).toBe(200);
  });

  it("H1 に「YYYY年M月の{カテゴリ名}に良い日」を含む", async () => {
    const { body } = await fetchPath("/purposes/wedding-ceremony/2026-06/");
    expect(body).toContain("2026年6月の結婚式に良い日");
  });

  it("上位ランキング(最大 10 日)の表行が含まれる", async () => {
    const { body } = await fetchPath("/purposes/wedding-ceremony/2026-06/");
    // テーブルヘッダ
    expect(body).toContain("<th>順位</th>");
    expect(body).toContain("<th>判定</th>");
    expect(body).toContain("<th>スコア</th>");
    // 6月の日付が少なくとも数件含まれる(具体日は計算結果依存)
    // Layer E narrative で最高スコア日の link が追加されたため上限 +1 を許容
    const rankRows = body.match(/<a href="\/days\/2026-06-\d{2}\/">/g) ?? [];
    expect(rankRows.length).toBeGreaterThanOrEqual(5);
    expect(rankRows.length).toBeLessThanOrEqual(11);
  });

  it("JSON-LD: TechArticle + ItemList + BreadcrumbList を含み、全て JSON.parse 可能", async () => {
    const { body } = await fetchPath("/purposes/wedding-ceremony/2026-06/");
    expect(body).toContain('"@type":"TechArticle"');
    expect(body).toContain('"@type":"ItemList"');
    expect(body).toContain('"@type":"BreadcrumbList"');
    const matches = Array.from(
      body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
    );
    // Tier 1(直近 2 年)は WebAPI + FAQPage が追加され 5 種、Tier 2/3 は 3〜4 種
    expect(matches.length).toBeGreaterThanOrEqual(3);
    for (const m of matches) {
      expect(() => JSON.parse(m[1] ?? "")).not.toThrow();
    }
  });

  it("JSON-LD ItemList: itemListElement に rank ↔ /days/{date}/ URL 付き", async () => {
    const { body } = await fetchPath("/purposes/wedding-ceremony/2026-06/");
    expect(body).toContain('"itemListOrder":"https://schema.org/ItemListOrderDescending"');
    expect(body).toMatch(/"position":1/);
    expect(body).toMatch(/"url":"https:\/\/shirabe\.dev\/days\/2026-06-\d{2}\/"/);
  });

  it("canonical URL + rel='prev' / rel='next' を含む(月内移動)", async () => {
    const { body } = await fetchPath("/purposes/wedding-ceremony/2026-06/");
    expect(body).toContain('rel="canonical"');
    expect(body).toContain('href="https://shirabe.dev/purposes/wedding-ceremony/2026-06/"');
    expect(body).toContain('rel="prev"');
    expect(body).toContain('href="https://shirabe.dev/purposes/wedding-ceremony/2026-05/"');
    expect(body).toContain('rel="next"');
    expect(body).toContain('href="https://shirabe.dev/purposes/wedding-ceremony/2026-07/"');
  });

  it("API curl 例(/api/v1/calendar/best-days?purpose=wedding&...) を含む", async () => {
    const { body } = await fetchPath("/purposes/wedding-ceremony/2026-06/");
    expect(body).toContain("https://shirabe.dev/api/v1/calendar/best-days");
    expect(body).toContain("purpose=wedding");
    expect(body).toContain("start=2026-06-01");
    expect(body).toContain("end=2026-06-30");
  });

  it("同 API カテゴリの sibling SEO カテゴリへのリンクを含む(wedding-ceremony → 入籍以外の祝事系)", async () => {
    const { body } = await fetchPath("/purposes/wedding-ceremony/2026-06/");
    // 結婚式 と同じく wedding API カテゴリにマップされる「お見合い」「結納」等への誘導
    expect(body).toContain('href="/purposes/omiai/2026-06/"');
    expect(body).toContain('href="/purposes/yuino/2026-06/"');
  });

  it("カテゴリ一覧 /purposes/ への戻りリンクを含む", async () => {
    const { body } = await fetchPath("/purposes/wedding-ceremony/2026-06/");
    expect(body).toContain('href="/purposes/"');
  });

  it("OG / Twitter image meta tag を含む(og:image + summary_large_image)", async () => {
    const { body } = await fetchPath("/purposes/wedding-ceremony/2026-06/");
    expect(body).toContain('property="og:image" content="https://shirabe.dev/og-default.svg"');
    expect(body).toContain('name="twitter:card" content="summary_large_image"');
  });
});

describe("GET /purposes/:slug/:ym — 境界値", () => {
  it("下限 (2010-01) は 200、prev は範囲外として表示される", async () => {
    const { res, body } = await fetchPath("/purposes/wedding-ceremony/2010-01/");
    expect(res.status).toBe(200);
    // 2009-12 への prev リンクは生成されない(代わりに「前月なし」表示)
    expect(body).not.toContain('href="/purposes/wedding-ceremony/2009-12/"');
    expect(body).toContain("前月なし");
  });

  it("上限 (2034-12) は 200、next は範囲外として表示される", async () => {
    const { res, body } = await fetchPath("/purposes/wedding-ceremony/2034-12/");
    expect(res.status).toBe(200);
    expect(body).not.toContain('href="/purposes/wedding-ceremony/2035-01/"');
    expect(body).toContain("翌月なし");
  });

  it("閏年 2 月 (2024-02) は 29 日まで集計対象", async () => {
    const { res, body } = await fetchPath("/purposes/wedding-ceremony/2024-02/");
    expect(res.status).toBe(200);
    expect(body).toContain("end=2024-02-29");
  });
});

describe("GET /purposes/:slug/:ym — バリデーションエラー", () => {
  it("未知 slug は 404 text/plain", async () => {
    const { res, body } = await fetchPath("/purposes/unknown-cat/2026-06");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(body).toContain("Unknown purpose category");
  });

  it("YYYY-MM 形式不正 (2026-13) は 400 text/plain", async () => {
    const { res, body } = await fetchPath("/purposes/wedding-ceremony/2026-13");
    expect(res.status).toBe(400);
    expect(body).toContain("Invalid month format");
  });

  it("範囲外(2009-12)は 404 text/plain", async () => {
    const { res, body } = await fetchPath("/purposes/wedding-ceremony/2009-12");
    expect(res.status).toBe(404);
    expect(body).toContain("out of supported range");
    expect(body).toContain("2010-01 to 2034-12");
  });

  it("範囲外(2035-01)は 404", async () => {
    const { res } = await fetchPath("/purposes/wedding-ceremony/2035-01");
    expect(res.status).toBe(404);
  });

  it("認証ミドルウェアをバイパスする(401 にならない)", async () => {
    const { res } = await fetchPath("/purposes/wedding-ceremony/2026-06");
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Sibling routes / sitemap-purposes
// ---------------------------------------------------------------------------

describe("generatePurposesSitemapBody (helper)", () => {
  it("urlset + 8,400 URL を含む", () => {
    const body = generatePurposesSitemapBody("2026-04-25");
    expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    const locCount = (body.match(/<loc>/g) ?? []).length;
    expect(locCount).toBe(8400);
  });

  it("代表 URL (2026-06 結婚式 / 2010-01 入籍 / 2034-12 旅行) を含む", () => {
    const body = generatePurposesSitemapBody("2026-04-25");
    expect(body).toContain(
      "<loc>https://shirabe.dev/purposes/wedding-ceremony/2026-06/</loc>"
    );
    expect(body).toContain(
      "<loc>https://shirabe.dev/purposes/marriage-registration/2010-01/</loc>"
    );
    expect(body).toContain("<loc>https://shirabe.dev/purposes/travel/2034-12/</loc>");
  });

  it("Tier-aware priority(0.4 / 0.6 / 0.8)+ changefreq monthly + lastmod を全エントリに設定", () => {
    const body = generatePurposesSitemapBody("2026-04-25", 2026);
    // Tier 1(2026, 2027): 0.8
    expect(body).toContain("<priority>0.8</priority>");
    // Tier 2(2021-2025, 2028-2031): 0.6
    expect(body).toContain("<priority>0.6</priority>");
    // Tier 3(2010-2020, 2032-2034): 0.4
    expect(body).toContain("<priority>0.4</priority>");
    // 全 Tier で changefreq monthly
    expect(body).toContain("<changefreq>monthly</changefreq>");
    expect(body).toContain("<lastmod>2026-04-25</lastmod>");
  });
});

describe("GET /sitemap-purposes.xml (T-02 + T-04)", () => {
  it("200 + application/xml + 8,400 URL", async () => {
    const { res, body } = await fetchPath("/sitemap-purposes.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
    const locCount = (body.match(/<loc>/g) ?? []).length;
    expect(locCount).toBe(8400);
  });

  it("Cache-Control: public, max-age >= 86400 (24h)", async () => {
    const { res } = await fetchPath("/sitemap-purposes.xml");
    const cache = res.headers.get("cache-control") ?? "";
    expect(cache).toContain("public");
    const match = cache.match(/max-age=(\d+)/);
    expect(parseInt(match?.[1] ?? "0", 10)).toBeGreaterThanOrEqual(86400);
  });
});

// ---------------------------------------------------------------------------
// Cross-link from /days/* (T-01 → T-02 誘導)
// ---------------------------------------------------------------------------

describe("/days/{date}/ → /purposes/{slug}/{ym}/ クロスリンク(T-02 連携)", () => {
  it("2010-2034 範囲内の日付では purpose-month へのリンクを表示", async () => {
    const { body } = await fetchPath("/days/2026-06-15");
    expect(body).toContain("用途別ランキング");
    expect(body).toMatch(/href="\/purposes\/[a-z-]+\/2026-06\/"/);
  });

  it("T-02 範囲外(2009 以前 / 2035 以降)では purpose-month リンクを出さない", async () => {
    const { body } = await fetchPath("/days/2009-06-15");
    expect(body).not.toMatch(/href="\/purposes\/[a-z-]+\/2009-06\/"/);
  });
});

// ---------------------------------------------------------------------------
// Layer E (R-5) original narrative for /purposes/(Tier 1 のみ)
//
// 「月の全体像」section を Tier 1 で生成。上位 10 日のデータから rokuyo 分布 +
// 暦注吉日数 + 最高スコア を集計し、AI 引用しやすい context unit を提供。
// ---------------------------------------------------------------------------

describe("Layer E: /purposes/{slug}/{ym}/ Tier 1 narrative", () => {
  it("Tier 1 ページは「月の全体像」narrative を含む", async () => {
    const { body } = await fetchPath("/purposes/wedding-ceremony/2026-06/");
    expect(body).toContain("月の全体像");
    expect(body).toContain("Month overview");
  });

  it("narrative は最高スコア日付のリンクと六曜分布を含む", async () => {
    const { body } = await fetchPath("/purposes/wedding-ceremony/2026-06/");
    // 最高スコア日付の /days/ リンク
    expect(body).toMatch(/href="\/days\/2026-06-\d{2}\/"/);
    // 六曜分布の表示(N日 表記が複数含まれる)
    expect(body).toMatch(/\d+\s*日/);
  });

  it("narrative は暦注吉日数を表示する", async () => {
    const { body } = await fetchPath("/purposes/wedding-ceremony/2026-06/");
    expect(body).toContain("暦注吉日");
  });

  it("Tier 3(2010 年)では narrative を含まない", async () => {
    const { body } = await fetchPath("/purposes/wedding-ceremony/2010-06/");
    expect(body).not.toContain("月の全体像");
  });
});
