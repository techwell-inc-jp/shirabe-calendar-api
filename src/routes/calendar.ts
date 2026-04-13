/**
 * カレンダーAPIエンドポイント
 *
 * PRD Section 1.3 の3つのエンドポイントを実装:
 * - EP1: GET /api/v1/calendar/:date
 * - EP2: GET /api/v1/calendar/range
 * - EP3: GET /api/v1/calendar/best-days
 */
import { Hono } from "hono";
import type { Category } from "../core/types.js";
import {
  CATEGORIES,
} from "../core/types.js";
import {
  parseDate,
  isDateInRange,
  getCalendarInfo,
  getCalendarRange,
  getBestDays,
} from "../core/calendar-service.js";

const calendar = new Hono();

/** 曜日文字列→数値マッピング */
const WEEKDAY_MAP: Record<string, number> = {
  日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

// ============================================================
// EP2: GET /api/v1/calendar/range
// rangeとbest-daysは:dateより先に定義（Honoのルーティング順序）
// ============================================================

calendar.get("/range", (c) => {
  const start = c.req.query("start");
  const end = c.req.query("end");

  if (!start || !end) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAMETER",
          message: "Both 'start' and 'end' query parameters are required",
        },
      },
      400
    );
  }

  const startParsed = parseDate(start);
  const endParsed = parseDate(end);

  if (!startParsed || !endParsed) {
    return c.json(
      {
        error: {
          code: "INVALID_DATE",
          message: "Date must be in YYYY-MM-DD format and between 1873-01-01 and 2100-12-31",
          details: { start, end },
        },
      },
      400
    );
  }

  if (!isDateInRange(...startParsed) || !isDateInRange(...endParsed)) {
    return c.json(
      {
        error: {
          code: "INVALID_DATE",
          message: "Date must be between 1873-01-01 and 2100-12-31",
        },
      },
      400
    );
  }

  // 最大93日間チェック
  const diffMs =
    new Date(endParsed[0], endParsed[1] - 1, endParsed[2]).getTime() -
    new Date(startParsed[0], startParsed[1] - 1, startParsed[2]).getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAMETER",
          message: "'end' must be after 'start'",
        },
      },
      400
    );
  }

  if (diffDays > 93) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAMETER",
          message: "Date range must not exceed 93 days",
          details: { days: diffDays },
        },
      },
      400
    );
  }

  // フィルターパース
  const filterRokuyo = c.req.query("filter_rokuyo")?.split(",").filter(Boolean);
  const filterRekichu = c.req.query("filter_rekichu")?.split(",").filter(Boolean);
  const category = c.req.query("category") as Category | undefined;
  const minScoreStr = c.req.query("min_score");
  const minScore = minScoreStr ? parseInt(minScoreStr, 10) : undefined;

  if (category && !CATEGORIES.includes(category)) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAMETER",
          message: `Invalid category: ${category}. Valid categories: ${CATEGORIES.join(", ")}`,
        },
      },
      400
    );
  }

  if (minScore != null && (isNaN(minScore) || minScore < 1 || minScore > 10)) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAMETER",
          message: "min_score must be between 1 and 10",
        },
      },
      400
    );
  }

  const result = getCalendarRange(
    startParsed[0], startParsed[1], startParsed[2],
    endParsed[0], endParsed[1], endParsed[2],
    { filterRokuyo, filterRekichu, category, minScore }
  );

  return c.json(result);
});

// ============================================================
// EP3: GET /api/v1/calendar/best-days
// ============================================================

calendar.get("/best-days", (c) => {
  const purpose = c.req.query("purpose") as Category | undefined;
  const start = c.req.query("start");
  const end = c.req.query("end");
  const limitStr = c.req.query("limit");
  const excludeWeekdaysStr = c.req.query("exclude_weekdays");

  if (!purpose || !start || !end) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAMETER",
          message: "'purpose', 'start', and 'end' query parameters are required",
        },
      },
      400
    );
  }

  if (!CATEGORIES.includes(purpose)) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAMETER",
          message: `Invalid purpose: ${purpose}. Valid purposes: ${CATEGORIES.join(", ")}`,
        },
      },
      400
    );
  }

  const startParsed = parseDate(start);
  const endParsed = parseDate(end);

  if (!startParsed || !endParsed) {
    return c.json(
      {
        error: {
          code: "INVALID_DATE",
          message: "Date must be in YYYY-MM-DD format and between 1873-01-01 and 2100-12-31",
        },
      },
      400
    );
  }

  if (!isDateInRange(...startParsed) || !isDateInRange(...endParsed)) {
    return c.json(
      {
        error: {
          code: "INVALID_DATE",
          message: "Date must be between 1873-01-01 and 2100-12-31",
        },
      },
      400
    );
  }

  // 最大365日間
  const diffMs =
    new Date(endParsed[0], endParsed[1] - 1, endParsed[2]).getTime() -
    new Date(startParsed[0], startParsed[1] - 1, startParsed[2]).getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAMETER",
          message: "'end' must be after 'start'",
        },
      },
      400
    );
  }

  if (diffDays > 365) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAMETER",
          message: "Date range must not exceed 365 days",
          details: { days: diffDays },
        },
      },
      400
    );
  }

  const limit = limitStr ? parseInt(limitStr, 10) : 5;
  if (isNaN(limit) || limit < 1 || limit > 20) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAMETER",
          message: "limit must be between 1 and 20",
        },
      },
      400
    );
  }

  // 除外曜日パース
  const excludeWeekdays: number[] = [];
  if (excludeWeekdaysStr) {
    for (const w of excludeWeekdaysStr.split(",")) {
      const trimmed = w.trim().toLowerCase();
      const num = WEEKDAY_MAP[trimmed];
      if (num != null) {
        excludeWeekdays.push(num);
      }
    }
  }

  const result = getBestDays({
    purpose,
    startYear: startParsed[0],
    startMonth: startParsed[1],
    startDay: startParsed[2],
    endYear: endParsed[0],
    endMonth: endParsed[1],
    endDay: endParsed[2],
    limit,
    excludeWeekdays,
  });

  return c.json(result);
});

// ============================================================
// EP1: GET /api/v1/calendar/:date
// ============================================================

calendar.get("/:date", (c) => {
  const dateStr = c.req.param("date");
  const parsed = parseDate(dateStr);

  if (!parsed) {
    return c.json(
      {
        error: {
          code: "INVALID_DATE",
          message: "Date must be in YYYY-MM-DD format and between 1873-01-01 and 2100-12-31",
          details: { received: dateStr },
        },
      },
      400
    );
  }

  const [year, month, day] = parsed;

  if (!isDateInRange(year, month, day)) {
    return c.json(
      {
        error: {
          code: "INVALID_DATE",
          message: "Date must be between 1873-01-01 and 2100-12-31",
          details: { received: dateStr },
        },
      },
      400
    );
  }

  // カテゴリパース
  const categoriesStr = c.req.query("categories");
  let categories: Category[] | undefined;
  if (categoriesStr) {
    const parsed = categoriesStr.split(",").filter(Boolean) as Category[];
    const invalid = parsed.filter((cat) => !CATEGORIES.includes(cat));
    if (invalid.length > 0) {
      return c.json(
        {
          error: {
            code: "INVALID_PARAMETER",
            message: `Invalid categories: ${invalid.join(", ")}. Valid categories: ${CATEGORIES.join(", ")}`,
          },
        },
        400
      );
    }
    categories = parsed;
  }

  const result = getCalendarInfo(year, month, day, categories);
  return c.json(result);
});

export { calendar };
