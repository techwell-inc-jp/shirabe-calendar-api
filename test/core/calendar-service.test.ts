/**
 * 統合サービスのテスト
 */
import { describe, it, expect } from "vitest";
import {
  parseDate,
  isDateInRange,
  getCalendarInfo,
  getCalendarRange,
  getBestDays,
} from "../../src/core/calendar-service.js";

describe("parseDate", () => {
  it("正しい日付をパースできる", () => {
    expect(parseDate("2026-04-12")).toEqual([2026, 4, 12]);
    expect(parseDate("1873-01-01")).toEqual([1873, 1, 1]);
    expect(parseDate("2100-12-31")).toEqual([2100, 12, 31]);
  });

  it("不正な形式はnullを返す", () => {
    expect(parseDate("2026/04/12")).toBeNull();
    expect(parseDate("2026-4-12")).toBeNull();
    expect(parseDate("abc")).toBeNull();
    expect(parseDate("")).toBeNull();
  });

  it("存在しない日付はnullを返す", () => {
    expect(parseDate("2026-02-29")).toBeNull(); // 2026は閏年でない
    expect(parseDate("2026-13-01")).toBeNull();
    expect(parseDate("2026-04-31")).toBeNull();
  });

  it("閏年の2月29日はパースできる", () => {
    expect(parseDate("2024-02-29")).toEqual([2024, 2, 29]);
  });
});

describe("isDateInRange", () => {
  it("範囲内の日付はtrue", () => {
    expect(isDateInRange(2026, 4, 12)).toBe(true);
    expect(isDateInRange(1873, 1, 1)).toBe(true);
    expect(isDateInRange(2100, 12, 31)).toBe(true);
  });

  it("範囲外の日付はfalse", () => {
    expect(isDateInRange(1872, 12, 31)).toBe(false);
    expect(isDateInRange(2101, 1, 1)).toBe(false);
  });
});

describe("getCalendarInfo", () => {
  it("2026-04-12の暦情報を正しく返す", () => {
    const result = getCalendarInfo(2026, 4, 12);

    // 基本フィールドの存在確認
    expect(result.date).toBe("2026-04-12");
    expect(result.wareki).toContain("令和");
    expect(result.wareki).toContain("8");
    expect(result.day_of_week.ja).toBeTruthy();
    expect(result.day_of_week.en).toBeTruthy();
  });

  it("旧暦フィールドが正しい構造", () => {
    const result = getCalendarInfo(2026, 4, 12);

    expect(result.kyureki.year).toBeGreaterThanOrEqual(2025);
    expect(result.kyureki.month).toBeGreaterThanOrEqual(1);
    expect(result.kyureki.month).toBeLessThanOrEqual(12);
    expect(result.kyureki.day).toBeGreaterThanOrEqual(1);
    expect(typeof result.kyureki.is_leap_month).toBe("boolean");
    expect(result.kyureki.month_name).toBeTruthy();
  });

  it("六曜フィールドが正しい構造", () => {
    const result = getCalendarInfo(2026, 4, 12);

    expect(result.rokuyo.name).toBeTruthy();
    expect(result.rokuyo.reading).toBeTruthy();
    expect(result.rokuyo.description).toBeTruthy();
    expect(result.rokuyo.time_slots.morning).toBeTruthy();
    expect(result.rokuyo.time_slots.noon).toBeTruthy();
    expect(result.rokuyo.time_slots.afternoon).toBeTruthy();
    expect(result.rokuyo.time_slots.evening).toBeTruthy();
  });

  it("干支フィールドが正しい構造", () => {
    const result = getCalendarInfo(2026, 4, 12);

    expect(result.kanshi.full).toBeTruthy();
    expect(result.kanshi.jikkan).toBeTruthy();
    expect(result.kanshi.junishi).toBeTruthy();
    expect(result.kanshi.junishi_animal.ja).toBeTruthy();
    expect(result.kanshi.junishi_animal.en).toBeTruthy();
    expect(result.kanshi.full).toBe(`${result.kanshi.jikkan}${result.kanshi.junishi}`);
  });

  it("二十四節気フィールドが正しい構造", () => {
    const result = getCalendarInfo(2026, 4, 12);

    expect(result.nijushi_sekki.name).toBeTruthy();
    expect(result.nijushi_sekki.reading).toBeTruthy();
    expect(result.nijushi_sekki.description).toBeTruthy();
    expect(typeof result.nijushi_sekki.is_today).toBe("boolean");
  });

  it("暦注フィールドが配列", () => {
    const result = getCalendarInfo(2026, 4, 12);

    expect(Array.isArray(result.rekichu)).toBe(true);
    for (const r of result.rekichu) {
      expect(r.name).toBeTruthy();
      expect(r.reading).toBeTruthy();
      expect(r.description).toBeTruthy();
      expect(["吉", "凶"]).toContain(r.type);
    }
  });

  it("コンテキストが全8カテゴリ分ある（デフォルト）", () => {
    const result = getCalendarInfo(2026, 4, 12);

    const keys = Object.keys(result.context);
    expect(keys.length).toBe(8);
  });

  it("カテゴリ指定で絞り込みできる", () => {
    const result = getCalendarInfo(2026, 4, 12, ["wedding", "business"]);

    const keys = Object.keys(result.context);
    expect(keys.length).toBe(2);
    expect(keys).toContain("結婚");
    expect(keys).toContain("開業");
  });

  it("サマリーが文字列で返される", () => {
    const result = getCalendarInfo(2026, 4, 12);

    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("和暦が正しく変換される", () => {
    expect(getCalendarInfo(2026, 1, 1).wareki).toBe("令和8年1月1日");
    expect(getCalendarInfo(2019, 5, 1).wareki).toBe("令和元年5月1日");
    expect(getCalendarInfo(2019, 4, 30).wareki).toBe("平成31年4月30日");
  });
});

describe("getCalendarRange", () => {
  it("1ヶ月分のデータを返す", () => {
    const result = getCalendarRange(2026, 4, 1, 2026, 4, 30);

    expect(result.start).toBe("2026-04-01");
    expect(result.end).toBe("2026-04-30");
    expect(result.count).toBe(30);
    expect(result.dates.length).toBe(30);
  });

  it("六曜フィルターが動作する", () => {
    const result = getCalendarRange(2026, 4, 1, 2026, 4, 30, {
      filterRokuyo: ["大安"],
    });

    expect(result.count).toBeLessThan(30);
    expect(result.count).toBeGreaterThan(0);
    for (const d of result.dates) {
      expect(d.rokuyo).toBe("大安");
    }
  });

  it("filters_appliedが正しく返される", () => {
    const result = getCalendarRange(2026, 4, 1, 2026, 4, 30, {
      filterRokuyo: ["大安"],
      category: "wedding",
    });

    expect(result.filters_applied.rokuyo).toEqual(["大安"]);
    expect(result.filters_applied.category).toBe("wedding");
    expect(result.filters_applied.rekichu).toBeNull();
    expect(result.filters_applied.min_score).toBeNull();
  });

  it("各日付にrokuyo, rekichu, contextが含まれる", () => {
    const result = getCalendarRange(2026, 4, 1, 2026, 4, 3);

    for (const d of result.dates) {
      expect(d.date).toBeTruthy();
      expect(d.rokuyo).toBeTruthy();
      expect(Array.isArray(d.rekichu)).toBe(true);
      expect(Object.keys(d.context).length).toBeGreaterThan(0);
    }
  });
});

describe("getBestDays", () => {
  it("結婚に最適な日をランキングで返す", () => {
    const result = getBestDays({
      purpose: "wedding",
      startYear: 2026, startMonth: 4, startDay: 1,
      endYear: 2026, endMonth: 4, endDay: 30,
      limit: 5,
    });

    expect(result.purpose).toBe("wedding");
    expect(result.best_days.length).toBeLessThanOrEqual(5);
    expect(result.best_days.length).toBeGreaterThan(0);

    // ランク順
    for (let i = 0; i < result.best_days.length; i++) {
      expect(result.best_days[i].rank).toBe(i + 1);
    }

    // スコア降順
    for (let i = 1; i < result.best_days.length; i++) {
      expect(result.best_days[i].score).toBeLessThanOrEqual(result.best_days[i - 1].score);
    }
  });

  it("レスポンス構造がPRD準拠", () => {
    const result = getBestDays({
      purpose: "business",
      startYear: 2026, startMonth: 5, startDay: 1,
      endYear: 2026, endMonth: 5, endDay: 31,
      limit: 3,
    });

    expect(result.period.start).toBe("2026-05-01");
    expect(result.period.end).toBe("2026-05-31");

    for (const day of result.best_days) {
      expect(day).toHaveProperty("rank");
      expect(day).toHaveProperty("date");
      expect(day).toHaveProperty("day_of_week");
      expect(day).toHaveProperty("rokuyo");
      expect(day).toHaveProperty("rekichu");
      expect(day).toHaveProperty("judgment");
      expect(day).toHaveProperty("score");
      expect(day).toHaveProperty("note");
    }
  });

  it("除外曜日が機能する", () => {
    const result = getBestDays({
      purpose: "wedding",
      startYear: 2026, startMonth: 4, startDay: 1,
      endYear: 2026, endMonth: 4, endDay: 30,
      excludeWeekdays: [1, 2, 3, 4, 5], // 月〜金を除外 = 土日のみ
    });

    for (const day of result.best_days) {
      const d = new Date(day.date);
      const dow = d.getDay();
      expect([0, 6]).toContain(dow); // 日曜 or 土曜
    }
  });
});
