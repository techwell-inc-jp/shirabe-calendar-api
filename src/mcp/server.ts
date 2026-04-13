/**
 * MCPサーバー実装
 *
 * @modelcontextprotocol/sdk を使用してMCPサーバーを構築する。
 * calendar-serviceを直接呼び出す（同一プロセス内）。
 * レスポンスはTextContent型でJSON文字列を返す。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getCalendarInfo,
  getCalendarRange,
  getBestDays,
  parseDate,
  isDateInRange,
} from "../core/calendar-service.js";
import type { Category } from "../core/types.js";
import { DATE_RANGE } from "../core/types.js";
import {
  GET_JAPANESE_CALENDAR_NAME,
  GET_JAPANESE_CALENDAR_DESCRIPTION,
  getJapaneseCalendarSchema,
  FIND_BEST_DAYS_NAME,
  FIND_BEST_DAYS_DESCRIPTION,
  findBestDaysSchema,
  GET_CALENDAR_RANGE_NAME,
  GET_CALENDAR_RANGE_DESCRIPTION,
  getCalendarRangeSchema,
} from "./tools.js";

/** 最大範囲日数 */
const MAX_RANGE_DAYS = 93;
const MAX_BEST_DAYS_RANGE = 365;

/**
 * MCPサーバーインスタンスを作成する
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "shirabe-calendar",
    version: "1.0.0",
  });

  // Tool 1: get_japanese_calendar
  server.tool(
    GET_JAPANESE_CALENDAR_NAME,
    GET_JAPANESE_CALENDAR_DESCRIPTION,
    getJapaneseCalendarSchema,
    async ({ date, categories }) => {
      const parsed = parseDate(date);
      if (!parsed) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: { code: "INVALID_DATE", message: `Invalid date format: ${date}. Use YYYY-MM-DD.` },
              }),
            },
          ],
          isError: true,
        };
      }

      const [year, month, day] = parsed;
      if (!isDateInRange(year, month, day)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: {
                  code: "DATE_OUT_OF_RANGE",
                  message: `Date must be between ${DATE_RANGE.MIN} and ${DATE_RANGE.MAX}.`,
                },
              }),
            },
          ],
          isError: true,
        };
      }

      const result = getCalendarInfo(year, month, day, categories as Category[] | undefined);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

  // Tool 2: find_best_days
  server.tool(
    FIND_BEST_DAYS_NAME,
    FIND_BEST_DAYS_DESCRIPTION,
    findBestDaysSchema,
    async ({ purpose, start_date, end_date, limit }) => {
      const startParsed = parseDate(start_date);
      const endParsed = parseDate(end_date);

      if (!startParsed || !endParsed) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: { code: "INVALID_DATE", message: "Invalid date format. Use YYYY-MM-DD." },
              }),
            },
          ],
          isError: true,
        };
      }

      const [sy, sm, sd] = startParsed;
      const [ey, em, ed] = endParsed;

      if (!isDateInRange(sy, sm, sd) || !isDateInRange(ey, em, ed)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: {
                  code: "DATE_OUT_OF_RANGE",
                  message: `Date must be between ${DATE_RANGE.MIN} and ${DATE_RANGE.MAX}.`,
                },
              }),
            },
          ],
          isError: true,
        };
      }

      // 日数チェック
      const startMs = new Date(sy, sm - 1, sd).getTime();
      const endMs = new Date(ey, em - 1, ed).getTime();
      const days = Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24));

      if (days < 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: { code: "INVALID_PARAMETER", message: "end_date must be after start_date." },
              }),
            },
          ],
          isError: true,
        };
      }

      if (days > MAX_BEST_DAYS_RANGE) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: {
                  code: "RANGE_TOO_LARGE",
                  message: `Date range must not exceed ${MAX_BEST_DAYS_RANGE} days.`,
                },
              }),
            },
          ],
          isError: true,
        };
      }

      const result = getBestDays({
        purpose: purpose as Category,
        startYear: sy,
        startMonth: sm,
        startDay: sd,
        endYear: ey,
        endMonth: em,
        endDay: ed,
        limit,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

  // Tool 3: get_calendar_range
  server.tool(
    GET_CALENDAR_RANGE_NAME,
    GET_CALENDAR_RANGE_DESCRIPTION,
    getCalendarRangeSchema,
    async ({ start, end, filter_rokuyo, filter_rekichu }) => {
      const startParsed = parseDate(start);
      const endParsed = parseDate(end);

      if (!startParsed || !endParsed) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: { code: "INVALID_DATE", message: "Invalid date format. Use YYYY-MM-DD." },
              }),
            },
          ],
          isError: true,
        };
      }

      const [sy, sm, sd] = startParsed;
      const [ey, em, ed] = endParsed;

      if (!isDateInRange(sy, sm, sd) || !isDateInRange(ey, em, ed)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: {
                  code: "DATE_OUT_OF_RANGE",
                  message: `Date must be between ${DATE_RANGE.MIN} and ${DATE_RANGE.MAX}.`,
                },
              }),
            },
          ],
          isError: true,
        };
      }

      const startMs = new Date(sy, sm - 1, sd).getTime();
      const endMs = new Date(ey, em - 1, ed).getTime();
      const days = Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24));

      if (days < 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: { code: "INVALID_PARAMETER", message: "end must be after start." },
              }),
            },
          ],
          isError: true,
        };
      }

      if (days > MAX_RANGE_DAYS) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: {
                  code: "RANGE_TOO_LARGE",
                  message: `Date range must not exceed ${MAX_RANGE_DAYS} days.`,
                },
              }),
            },
          ],
          isError: true,
        };
      }

      const result = getCalendarRange(sy, sm, sd, ey, em, ed, {
        filterRokuyo: filter_rokuyo ? [filter_rokuyo] : undefined,
        filterRekichu: filter_rekichu ? [filter_rekichu] : undefined,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

  return server;
}
