/**
 * T-04: サイトマップ大規模化のヘルパー関数群(pure functions、ユニットテスト容易)
 *
 * - 日付 range の列挙(閏年を Date.UTC で自動考慮)
 * - 日付別ページの urlset XML 生成
 * - 用途別月間ページの urlset XML 生成(T-02、8,400 URL)
 * - sitemap index XML 生成
 * - 既存 docs ページ / robots 類の static 定義
 */
import { enumerateAllPurposeUrls } from "../data/purposes-map.js";
import {
  getDayTier,
  getPurposeMonthTier,
  SITEMAP_DAYS_CHANGEFREQ,
  SITEMAP_DAYS_PRIORITY,
  SITEMAP_PURPOSES_CHANGEFREQ,
  SITEMAP_PURPOSES_PRIORITY,
} from "../data/tier.js";

/**
 * 指定年月の日数(閏年対応、JavaScript Date の自然な挙動に委ねる)。
 */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 指定年 range(両端含む)の全日付を `YYYY-MM-DD` 配列で返す。
 *
 * 閏年は JavaScript の Date.UTC がそのまま正しく扱うため、2/29 も自動対応。
 *
 * パフォーマンス注記: 50 年 = 約 18,263 日(閏年含む)。
 * 文字列連結は Workers 上でも数 ms で完了し、CPU 制限(10ms free / 50ms paid)内。
 */
export function enumerateDateRange(startYear: number, endYear: number): string[] {
  const dates: string[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const yStr = String(y);
    for (let m = 1; m <= 12; m++) {
      const last = daysInMonth(y, m);
      const mStr = String(m).padStart(2, "0");
      for (let d = 1; d <= last; d++) {
        const dStr = String(d).padStart(2, "0");
        dates.push(`${yStr}-${mStr}-${dStr}`);
      }
    }
  }
  return dates;
}

/**
 * /days/{date}/ ページ群の sitemap urlset XML を生成する(Tier-aware、PR #37)。
 *
 * Tier 別 priority / changefreq:
 *   - Tier 1(直近 2 年): priority 0.9, changefreq weekly(AI クエリ主戦場)
 *   - Tier 2(±5 年内): priority 0.5, changefreq yearly(中期需要)
 *   - Tier 3(歴史日付 + 遠未来): priority 0.3, changefreq yearly(low demand)
 *
 * Why Tier 化:
 *   GSC 仮説 B(品質判定)= 同質テンプレート + 量で push 判定で大量 indexing 保留
 *   される問題への構造対策。Tier signal で「直近高需要」を明示し、Google + AI 両方の
 *   品質 distribution 評価を改善する。詳細:
 *   shirabe-assets/knowledge/content-uniqueness-strengthening.md §2.1 Layer A
 *
 * @param startYear 開始年(含む)
 * @param endYear 終了年(含む)
 * @param lastmod YYYY-MM-DD(urlset 全体に共通、通常はサイトマップ生成日)
 * @param currentYear Tier 判定用基準年(デフォルト: 現在の UTC 年、テスト固定可能)
 */
export function generateDaysSitemapBody(
  startYear: number,
  endYear: number,
  lastmod: string,
  currentYear: number = new Date().getUTCFullYear()
): string {
  const dates = enumerateDateRange(startYear, endYear);
  const urls = dates
    .map((date) => {
      const yearStr = date.slice(0, 4);
      const tier = getDayTier(parseInt(yearStr, 10), currentYear);
      const priority = SITEMAP_DAYS_PRIORITY[tier];
      const changefreq = SITEMAP_DAYS_CHANGEFREQ[tier];
      return `  <url>\n    <loc>https://shirabe.dev/days/${date}/</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/** 既存 docs / 静的ページ一覧 */
export type SitemapDocEntry = {
  loc: string;
  priority: string;
  changefreq: string;
};

export const DOCS_SITEMAP_PAGES: ReadonlyArray<SitemapDocEntry> = [
  { loc: "https://shirabe.dev/", priority: "1.0", changefreq: "weekly" },
  { loc: "https://shirabe.dev/purposes/", priority: "0.9", changefreq: "weekly" },
  { loc: "https://shirabe.dev/docs/rokuyo-api", priority: "0.9", changefreq: "monthly" },
  { loc: "https://shirabe.dev/docs/rekichu-api", priority: "0.9", changefreq: "monthly" },
  { loc: "https://shirabe.dev/docs/calendar-pricing", priority: "0.8", changefreq: "monthly" },
  { loc: "https://shirabe.dev/topics/", priority: "0.9", changefreq: "monthly" },
  { loc: "https://shirabe.dev/topics/rokuyo", priority: "0.9", changefreq: "monthly" },
  { loc: "https://shirabe.dev/topics/rekichu", priority: "0.9", changefreq: "monthly" },
  { loc: "https://shirabe.dev/topics/kanshi", priority: "0.9", changefreq: "monthly" },
  {
    loc: "https://shirabe.dev/docs/address-normalize",
    priority: "0.9",
    changefreq: "monthly",
  },
  { loc: "https://shirabe.dev/docs/address-batch", priority: "0.8", changefreq: "monthly" },
  { loc: "https://shirabe.dev/docs/address-pricing", priority: "0.8", changefreq: "monthly" },
  { loc: "https://shirabe.dev/openapi.yaml", priority: "0.9", changefreq: "monthly" },
  { loc: "https://shirabe.dev/openapi-gpts.yaml", priority: "0.7", changefreq: "monthly" },
  {
    loc: "https://shirabe.dev/api/v1/address/openapi.yaml",
    priority: "0.9",
    changefreq: "monthly",
  },
  { loc: "https://shirabe.dev/llms.txt", priority: "0.8", changefreq: "weekly" },
  { loc: "https://shirabe.dev/llms-full.txt", priority: "0.8", changefreq: "weekly" },
  { loc: "https://shirabe.dev/api/v1/calendar/", priority: "0.9", changefreq: "monthly" },
  {
    loc: "https://shirabe.dev/api/v1/address/llms.txt",
    priority: "0.7",
    changefreq: "weekly",
  },
  {
    loc: "https://shirabe.dev/announcements/2026-05-01",
    priority: "0.8",
    changefreq: "monthly",
  },
  { loc: "https://shirabe.dev/upgrade", priority: "0.7", changefreq: "monthly" },
  { loc: "https://shirabe.dev/terms", priority: "0.3", changefreq: "yearly" },
  { loc: "https://shirabe.dev/privacy", priority: "0.3", changefreq: "yearly" },
  { loc: "https://shirabe.dev/legal", priority: "0.3", changefreq: "yearly" },
];

/**
 * /purposes/{slug}/{YYYY-MM}/ ページ群の sitemap urlset XML を生成する(T-02、Tier-aware)。
 *
 * Tier 別 priority(全 Tier で changefreq monthly):
 *   - Tier 1(直近 2 年): priority 0.8(AI クエリ主戦場、用途別ランキング demand 高)
 *   - Tier 2(±5 年内): priority 0.6(現状 default を維持、中期需要)
 *   - Tier 3(過去 + 遠未来): priority 0.4(low demand を明示)
 *
 * URL 数: 28 SEO カテゴリ × 25 年(2010-2034)× 12 ヶ月 = 8,400 URL(50,000/file 制限内)
 *
 * @param lastmod YYYY-MM-DD(urlset 全体に共通、通常はサイトマップ生成日)
 * @param currentYear Tier 判定用基準年(デフォルト: 現在の UTC 年、テスト固定可能)
 */
export function generatePurposesSitemapBody(
  lastmod: string,
  currentYear: number = new Date().getUTCFullYear()
): string {
  const all = enumerateAllPurposeUrls();
  const urls = all
    .map((u) => {
      const ym = `${u.year}-${String(u.month).padStart(2, "0")}`;
      const tier = getPurposeMonthTier(u.year, u.month, currentYear);
      const priority = SITEMAP_PURPOSES_PRIORITY[tier];
      const changefreq = SITEMAP_PURPOSES_CHANGEFREQ[tier];
      return `  <url>\n    <loc>https://shirabe.dev/purposes/${u.slug}/${ym}/</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/**
 * docs / 静的ページの sitemap urlset XML を生成する。
 */
export function generateDocsSitemapBody(lastmod: string): string {
  const urls = DOCS_SITEMAP_PAGES.map(
    (p) =>
      `  <url>\n    <loc>${p.loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/**
 * sitemap index を生成する(sub-sitemap 参照)。
 *
 * @param subSitemaps サブサイトマップの絶対 URL 配列
 * @param lastmod YYYY-MM-DD
 */
export function generateSitemapIndex(subSitemaps: ReadonlyArray<string>, lastmod: string): string {
  const entries = subSitemaps
    .map(
      (loc) =>
        `  <sitemap>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>
`;
}

/**
 * Shirabe のサブサイトマップ一覧(sitemap index 用の順序定義)。
 *
 * 各サブサイトマップは 50,000 URL/file 制限内:
 * - days-1: 1873-1949  ≈ 27,394 URL  (77 年)
 * - days-2: 1950-1999  ≈ 18,262 URL  (50 年)
 * - days-3: 2000-2049  ≈ 18,263 URL  (50 年、閏年含む)
 * - days-4: 2050-2100  ≈ 18,628 URL  (51 年)
 * - purposes:           8,400 URL  (28 カテゴリ × 25 年 × 12 ヶ月、T-02)
 * 合計 ≈ 90,947 URL(T-01 + T-02 + docs)
 */
export const SUB_SITEMAPS: ReadonlyArray<{ path: string; startYear?: number; endYear?: number }> =
  [
    { path: "https://shirabe.dev/sitemap-docs.xml" },
    { path: "https://shirabe.dev/sitemap-days-1.xml", startYear: 1873, endYear: 1949 },
    { path: "https://shirabe.dev/sitemap-days-2.xml", startYear: 1950, endYear: 1999 },
    { path: "https://shirabe.dev/sitemap-days-3.xml", startYear: 2000, endYear: 2049 },
    { path: "https://shirabe.dev/sitemap-days-4.xml", startYear: 2050, endYear: 2100 },
    { path: "https://shirabe.dev/sitemap-purposes.xml" },
  ];
