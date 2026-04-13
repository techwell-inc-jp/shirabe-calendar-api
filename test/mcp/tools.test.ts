/**
 * MCPツール定義のテスト
 */
import { describe, it, expect } from "vitest";
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
} from "../../src/mcp/tools.js";

describe("MCPツール定義", () => {
  describe("get_japanese_calendar", () => {
    it("正しいツール名を持つ", () => {
      expect(GET_JAPANESE_CALENDAR_NAME).toBe("get_japanese_calendar");
    });

    it("descriptionに日本語と英語の両方を含む", () => {
      expect(GET_JAPANESE_CALENDAR_DESCRIPTION).toContain("六曜");
      expect(GET_JAPANESE_CALENDAR_DESCRIPTION).toContain("暦注");
      expect(GET_JAPANESE_CALENDAR_DESCRIPTION).toContain("Rokuyo");
      expect(GET_JAPANESE_CALENDAR_DESCRIPTION).toContain("Rekichu");
      expect(GET_JAPANESE_CALENDAR_DESCRIPTION).toContain("Kanshi");
      expect(GET_JAPANESE_CALENDAR_DESCRIPTION).toContain("Nijushi Sekki");
    });

    it("descriptionに使用場面を含む", () => {
      expect(GET_JAPANESE_CALENDAR_DESCRIPTION).toContain("使用場面");
      expect(GET_JAPANESE_CALENDAR_DESCRIPTION).toContain("今日は大安");
    });

    it("inputSchemaにdateフィールドを持つ", () => {
      expect(getJapaneseCalendarSchema.date).toBeDefined();
    });

    it("inputSchemaにcategoriesフィールドを持つ", () => {
      expect(getJapaneseCalendarSchema.categories).toBeDefined();
    });
  });

  describe("find_best_days", () => {
    it("正しいツール名を持つ", () => {
      expect(FIND_BEST_DAYS_NAME).toBe("find_best_days");
    });

    it("descriptionに日本語と英語の両方を含む", () => {
      expect(FIND_BEST_DAYS_DESCRIPTION).toContain("最適な日");
      expect(FIND_BEST_DAYS_DESCRIPTION).toContain("ランキング");
      expect(FIND_BEST_DAYS_DESCRIPTION).toContain("best auspicious days");
    });

    it("descriptionに使用場面を含む", () => {
      expect(FIND_BEST_DAYS_DESCRIPTION).toContain("使用場面");
      expect(FIND_BEST_DAYS_DESCRIPTION).toContain("結婚式に最適");
    });

    it("inputSchemaに必須フィールドを持つ", () => {
      expect(findBestDaysSchema.purpose).toBeDefined();
      expect(findBestDaysSchema.start_date).toBeDefined();
      expect(findBestDaysSchema.end_date).toBeDefined();
    });

    it("inputSchemaにlimitフィールド（オプション）を持つ", () => {
      expect(findBestDaysSchema.limit).toBeDefined();
    });
  });

  describe("get_calendar_range", () => {
    it("正しいツール名を持つ", () => {
      expect(GET_CALENDAR_RANGE_NAME).toBe("get_calendar_range");
    });

    it("descriptionに日本語と英語の両方を含む", () => {
      expect(GET_CALENDAR_RANGE_DESCRIPTION).toContain("一括取得");
      expect(GET_CALENDAR_RANGE_DESCRIPTION).toContain("フィルタリング");
      expect(GET_CALENDAR_RANGE_DESCRIPTION).toContain("Retrieves calendar information");
    });

    it("descriptionに使用場面を含む", () => {
      expect(GET_CALENDAR_RANGE_DESCRIPTION).toContain("使用場面");
      expect(GET_CALENDAR_RANGE_DESCRIPTION).toContain("大安を全部");
    });

    it("inputSchemaに必須フィールドを持つ", () => {
      expect(getCalendarRangeSchema.start).toBeDefined();
      expect(getCalendarRangeSchema.end).toBeDefined();
    });

    it("inputSchemaにフィルターフィールド（オプション）を持つ", () => {
      expect(getCalendarRangeSchema.filter_rokuyo).toBeDefined();
      expect(getCalendarRangeSchema.filter_rekichu).toBeDefined();
    });
  });
});
