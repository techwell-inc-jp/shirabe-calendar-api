/**
 * B-1 AI 検索向け SEO ページルート: 日付別暦情報ページ(T-01、B-1 加速スプリント)
 *
 * GET /days/{YYYY-MM-DD}/  (trailing slash あり / なし 両対応)
 *
 * - 動的生成: getCalendarInfo() の結果を HTML テンプレートに埋込
 * - Cache: Cloudflare CDN 7 日(日付不変のため安全)
 * - 認証不要(ミドルウェアを通さず直接配信)
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { getCalendarInfo, isDateInRange, parseDate } from "../core/calendar-service.js";
import { renderDayDetailPage } from "../pages/day-detail.js";

const days = new Hono();

/**
 * 共通ハンドラ。形式検証 → 範囲検証 → 暦情報生成 → HTML レンダリング。
 *
 * - 形式不正(例: "2026-13-99"、"foo"): 400 text/plain
 * - 範囲外(1873-01-01 未満 or 2100-12-31 超過、例: "3000-01-01"): 404 text/plain
 * - 正常: 200 text/html + Cache-Control: public, max-age=604800
 */
function handleDayRequest(c: Context, dateStr: string): Response {
  const parsed = parseDate(dateStr);
  if (!parsed) {
    return c.text(
      `Invalid date format. Expected YYYY-MM-DD (received: ${dateStr}).\nSee https://shirabe.dev/docs/rokuyo-api for supported date specifications.\n`,
      400,
      { "Content-Type": "text/plain; charset=utf-8" }
    );
  }
  const [year, month, day] = parsed;
  if (!isDateInRange(year, month, day)) {
    return c.text(
      `Date out of supported range. Supported range is 1873-01-01 to 2100-12-31 (received: ${dateStr}).\n`,
      404,
      { "Content-Type": "text/plain; charset=utf-8" }
    );
  }
  const calendarData = getCalendarInfo(year, month, day);
  const html = renderDayDetailPage(calendarData);
  return c.html(html, 200, {
    "Cache-Control": "public, max-age=604800",
  });
}

// GET /days/:date (trailing slash なし)
days.get("/:date", (c) => handleDayRequest(c, c.req.param("date")));

// GET /days/:date/ (trailing slash 付き)
days.get("/:date/", (c) => handleDayRequest(c, c.req.param("date")));

export { days };
