/**
 * MCPツール定義
 *
 * 3つのMCPツールをzodスキーマとdescription付きで定義する。
 * PRD Section 1.4.1 に準拠。
 */
import { z } from "zod";

/** 有効なカテゴリ一覧 */
const VALID_CATEGORIES = [
  "wedding",
  "funeral",
  "moving",
  "construction",
  "business",
  "car_delivery",
  "marriage_registration",
  "travel",
] as const;

/**
 * Tool 1: get_japanese_calendar
 * 単日の暦情報取得
 */
export const GET_JAPANESE_CALENDAR_NAME = "get_japanese_calendar";

export const GET_JAPANESE_CALENDAR_DESCRIPTION = `日本の暦情報を取得します。指定した日付の六曜（大安・仏滅等）、
暦注（一粒万倍日・天赦日・不成就日等）、干支、二十四節気を返します。
さらに、結婚式・引っ越し・建築着工・開業などの用途別に
その日が吉か凶かの判定とアドバイスも返します。

使用場面:
- 「今日は大安？」「明日の六曜は？」
- 「11月15日に結婚式はどう？」
- 「来週の一粒万倍日はいつ？」
- 「今日は何か縁起が良い日？」

Returns Japanese calendar information including Rokuyo (six-day cycle fortune),
Rekichu (auspicious/inauspicious day indicators like Ichiryumanbaibi and Tenshanichi),
Kanshi (sexagenary cycle), and Nijushi Sekki (24 solar terms).
Also provides context-aware fortune judgments for events like weddings,
construction starts, business openings, and more.`;

export const getJapaneseCalendarSchema = {
  date: z.string().describe("日付 (YYYY-MM-DD形式)"),
  categories: z
    .array(z.enum(VALID_CATEGORIES))
    .optional()
    .describe("吉凶判定カテゴリ（省略時は全カテゴリ）"),
};

/**
 * Tool 2: find_best_days
 * 用途別ベスト日検索
 */
export const FIND_BEST_DAYS_NAME = "find_best_days";

export const FIND_BEST_DAYS_DESCRIPTION = `指定した用途（結婚・開業・引っ越し等）に最適な日を
期間内から探してランキングで返します。
六曜と暦注を総合的に評価し、最も縁起の良い日から順に返します。

使用場面:
- 「来月で結婚式に最適な日はいつ？」
- 「今年中に開業するなら何日がベスト？」
- 「4月の大安の一粒万倍日はある？」
- 「引っ越しに良い日を3つ教えて」

Finds the best auspicious days for a specific purpose (wedding, business opening,
moving, etc.) within a date range. Returns ranked results combining Rokuyo and
Rekichu evaluations.`;

export const findBestDaysSchema = {
  purpose: z
    .enum(VALID_CATEGORIES)
    .describe("用途 (wedding/funeral/moving/construction/business/car_delivery/marriage_registration/travel)"),
  start_date: z.string().describe("検索開始日 (YYYY-MM-DD形式)"),
  end_date: z.string().describe("検索終了日 (YYYY-MM-DD形式)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe("取得件数（デフォルト: 5、最大: 20）"),
};

/**
 * Tool 3: get_calendar_range
 * 範囲内の暦情報取得
 */
export const GET_CALENDAR_RANGE_NAME = "get_calendar_range";

export const GET_CALENDAR_RANGE_DESCRIPTION = `日付範囲内の暦情報を一括取得します。
六曜や暦注でフィルタリングできます。

使用場面:
- 「来月の大安を全部教えて」
- 「今年の天赦日一覧」
- 「今月の一粒万倍日はいつ？」

Retrieves calendar information for a date range with optional filtering
by Rokuyo or Rekichu type.`;

export const getCalendarRangeSchema = {
  start: z.string().describe("開始日 (YYYY-MM-DD形式)"),
  end: z.string().describe("終了日 (YYYY-MM-DD形式)"),
  filter_rokuyo: z
    .string()
    .optional()
    .describe("六曜フィルター（大安・仏滅・先勝・友引・先負・赤口）"),
  filter_rekichu: z
    .string()
    .optional()
    .describe("暦注フィルター（一粒万倍日・天赦日・不成就日等）"),
};
