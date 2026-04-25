/**
 * B-1 AI 検索向け SEO ページルート: 用途別月間ランキング(T-02、B-1 加速スプリント)
 *
 * GET /purposes/                            — 28 カテゴリ index ページ
 * GET /purposes/{slug}/{YYYY-MM}/           — 用途 × 月の上位 10 日ランキング(trailing slash 両対応)
 *
 * - 動的生成: getBestDays() の結果を HTML テンプレートに埋込
 * - Cache: Cloudflare CDN 7 日(月単位データのため安全)
 * - 認証不要(ミドルウェアを通さず直接配信)
 *
 * バリデーション:
 * - 形式不正(slug が文字列でない、YYYY-MM が "2026-13" 等): 400 text/plain
 * - 未知 slug / 範囲外月(2010 未満 or 2034 超過): 404 text/plain
 */
import { Hono } from "hono";
import type { Context } from "hono";
import {
  findPurposeBySlug,
  isYearMonthInRange,
  parseYearMonth,
  PURPOSES_MAX_YEAR,
  PURPOSES_MIN_YEAR,
} from "../data/purposes-map.js";
import { renderPurposeMonthPage } from "../pages/purpose-month.js";

const purposes = new Hono();

/**
 * /purposes/{slug}/{YYYY-MM} のハンドラ。
 *
 * - slug 未知: 404 text/plain
 * - YYYY-MM 形式不正: 400 text/plain
 * - 範囲外(2010-01 未満 or 2034-12 超過): 404 text/plain
 * - 正常: 200 text/html + Cache-Control: public, max-age=604800
 */
function handlePurposeMonth(c: Context, slug: string, ym: string): Response {
  const entry = findPurposeBySlug(slug);
  if (!entry) {
    return c.text(
      `Unknown purpose category: ${slug}. See https://shirabe.dev/purposes/ for the full list of supported categories.\n`,
      404,
      { "Content-Type": "text/plain; charset=utf-8" }
    );
  }
  const parsed = parseYearMonth(ym);
  if (!parsed) {
    return c.text(
      `Invalid month format. Expected YYYY-MM (received: ${ym}).\n`,
      400,
      { "Content-Type": "text/plain; charset=utf-8" }
    );
  }
  const [year, month] = parsed;
  if (!isYearMonthInRange(year, month)) {
    return c.text(
      `Month out of supported range. Supported range is ${PURPOSES_MIN_YEAR}-01 to ${PURPOSES_MAX_YEAR}-12 (received: ${ym}).\n`,
      404,
      { "Content-Type": "text/plain; charset=utf-8" }
    );
  }
  const html = renderPurposeMonthPage(entry, year, month);
  return c.html(html, 200, {
    "Cache-Control": "public, max-age=604800",
  });
}

// /purposes/ index ページは src/index.ts に直接登録(Hono の sub-router で
//  "/" パターンが prefix routing 上で安定しないための workaround)。

// /purposes/{slug}/{ym}  (trailing slash なし)
purposes.get("/:slug/:ym", (c) =>
  handlePurposeMonth(c, c.req.param("slug"), c.req.param("ym"))
);

// /purposes/{slug}/{ym}/ (trailing slash 付き)
purposes.get("/:slug/:ym/", (c) =>
  handlePurposeMonth(c, c.req.param("slug"), c.req.param("ym"))
);

export { purposes };
