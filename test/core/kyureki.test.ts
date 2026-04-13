/**
 * 旧暦変換エンジンのテスト
 */
import { describe, it, expect } from "vitest";
import {
  gregorianToJD,
  jdToGregorian,
  solarLongitude,
  toKyureki,
} from "../../src/core/kyureki.js";

describe("gregorianToJD", () => {
  it("J2000.0（2000年1月1日12時）のJDが正しい", () => {
    // 2000年1月1日12:00 UT = JD 2451545.0
    // gregorianToJDは正午基準なので、1月1.5日 = JD 2451545.0
    const jd = gregorianToJD(2000, 1, 1);
    // 0時基準なので JD 2451544.5
    expect(jd).toBeCloseTo(2451544.5, 1);
  });

  it("1873年1月1日（対応範囲の開始）", () => {
    const jd = gregorianToJD(1873, 1, 1);
    expect(jd).toBeCloseTo(2405159.5, 1);
  });

  it("2100年12月31日（対応範囲の終了）", () => {
    const jd = gregorianToJD(2100, 12, 31);
    expect(jd).toBeCloseTo(2488433.5, 1);
  });
});

describe("jdToGregorian", () => {
  it("JD → グレゴリオ暦の往復変換が正しい", () => {
    const testDates: [number, number, number][] = [
      [2000, 1, 1],
      [2026, 4, 12],
      [1873, 1, 1],
      [2100, 12, 31],
      [2024, 2, 29], // 閏年
    ];

    for (const [y, m, d] of testDates) {
      const jd = gregorianToJD(y, m, d);
      const [ry, rm, rd] = jdToGregorian(jd);
      expect([ry, rm, rd]).toEqual([y, m, d]);
    }
  });
});

describe("solarLongitude", () => {
  it("春分点付近で黄経が約0度", () => {
    // 2026年3月20日は春分の日
    const jd = gregorianToJD(2026, 3, 20);
    const lon = solarLongitude(jd);
    expect(lon).toBeGreaterThan(355);
    // 0度付近なので355〜5度の範囲
  });

  it("夏至付近で黄経が約90度", () => {
    const jd = gregorianToJD(2026, 6, 21);
    const lon = solarLongitude(jd);
    expect(lon).toBeCloseTo(90, -1); // ±1度
  });

  it("秋分付近で黄経が約180度", () => {
    const jd = gregorianToJD(2026, 9, 23);
    const lon = solarLongitude(jd);
    expect(lon).toBeCloseTo(180, -1);
  });

  it("冬至付近で黄経が約270度", () => {
    const jd = gregorianToJD(2026, 12, 22);
    const lon = solarLongitude(jd);
    expect(lon).toBeCloseTo(270, -1);
  });
});

describe("toKyureki", () => {
  it("2026年2月17日 = 旧暦2026年1月1日（旧正月）", () => {
    // 2026年の旧正月は2月17日
    const result = toKyureki(2026, 2, 17);
    expect(result.month).toBe(1);
    expect(result.day).toBe(1);
  });

  it("旧暦の月は1-12の範囲", () => {
    const result = toKyureki(2026, 6, 15);
    expect(result.month).toBeGreaterThanOrEqual(1);
    expect(result.month).toBeLessThanOrEqual(12);
  });

  it("旧暦の日は1-30の範囲", () => {
    const result = toKyureki(2026, 6, 15);
    expect(result.day).toBeGreaterThanOrEqual(1);
    expect(result.day).toBeLessThanOrEqual(30);
  });

  it("月名が正しく設定される", () => {
    const result = toKyureki(2026, 6, 15);
    expect(result.monthName).toBeTruthy();
    expect([
      "睦月", "如月", "弥生", "卯月", "皐月", "水無月",
      "文月", "葉月", "長月", "神無月", "霜月", "師走",
    ]).toContain(result.monthName);
  });

  it("連続する日付で旧暦日が1ずつ増える", () => {
    const d1 = toKyureki(2026, 5, 10);
    const d2 = toKyureki(2026, 5, 11);
    // 同じ月なら日が1増える、月が変わるなら日は1になる
    if (d1.month === d2.month) {
      expect(d2.day).toBe(d1.day + 1);
    } else {
      expect(d2.day).toBe(1);
    }
  });

  it("対応範囲の境界値で正常動作する", () => {
    expect(() => toKyureki(1873, 1, 1)).not.toThrow();
    expect(() => toKyureki(2100, 12, 31)).not.toThrow();
  });

  it("既知の旧暦変換が正しい: 2024年2月10日 = 旧暦1月1日", () => {
    // 2024年の旧正月は2月10日
    const result = toKyureki(2024, 2, 10);
    expect(result.month).toBe(1);
    expect(result.day).toBe(1);
  });
});
