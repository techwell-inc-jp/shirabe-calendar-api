/**
 * 六曜計算のテスト
 */
import { describe, it, expect } from "vitest";
import { calcRokuyo } from "../../src/core/rokuyo.js";
import type { KyurekiDate } from "../../src/core/types.js";

/**
 * ヘルパー: 旧暦日付を簡単に作成する
 */
function makeKyureki(month: number, day: number): KyurekiDate {
  return {
    year: 2026,
    month,
    day,
    isLeapMonth: false,
    monthName: "",
  };
}

describe("calcRokuyo", () => {
  it("(旧暦月 + 旧暦日) % 6 の算出式が正しい", () => {
    // (1 + 1) % 6 = 2 → 先勝
    const result = calcRokuyo(makeKyureki(1, 1));
    expect(result.name).toBe("先勝");
  });

  it("旧暦1月1日は先勝", () => {
    const result = calcRokuyo(makeKyureki(1, 1));
    expect(result.name).toBe("先勝");
  });

  it("旧暦2月1日は友引", () => {
    // (2 + 1) % 6 = 3 → 友引
    const result = calcRokuyo(makeKyureki(2, 1));
    expect(result.name).toBe("友引");
  });

  it("旧暦3月1日は先負", () => {
    // (3 + 1) % 6 = 4 → 先負
    const result = calcRokuyo(makeKyureki(3, 1));
    expect(result.name).toBe("先負");
  });

  it("旧暦4月1日は仏滅", () => {
    // (4 + 1) % 6 = 5 → 仏滅
    const result = calcRokuyo(makeKyureki(4, 1));
    expect(result.name).toBe("仏滅");
  });

  it("旧暦5月1日は大安", () => {
    // (5 + 1) % 6 = 0 → 大安
    const result = calcRokuyo(makeKyureki(5, 1));
    expect(result.name).toBe("大安");
  });

  it("旧暦6月1日は赤口", () => {
    // (6 + 1) % 6 = 1 → 赤口
    const result = calcRokuyo(makeKyureki(6, 1));
    expect(result.name).toBe("赤口");
  });

  it("六曜の全6種が読み・説明・時間帯を持つ", () => {
    for (let month = 1; month <= 6; month++) {
      const result = calcRokuyo(makeKyureki(month, 1));
      expect(result.reading).toBeTruthy();
      expect(result.description).toBeTruthy();
      expect(result.timeSlots).toBeDefined();
      expect(result.timeSlots.morning).toBeTruthy();
      expect(result.timeSlots.noon).toBeTruthy();
      expect(result.timeSlots.afternoon).toBeTruthy();
      expect(result.timeSlots.evening).toBeTruthy();
    }
  });

  it("大安は終日吉", () => {
    const result = calcRokuyo(makeKyureki(5, 1)); // 大安
    expect(result.timeSlots.morning).toBe("吉");
    expect(result.timeSlots.noon).toBe("吉");
    expect(result.timeSlots.afternoon).toBe("吉");
    expect(result.timeSlots.evening).toBe("吉");
  });

  it("仏滅は終日凶", () => {
    const result = calcRokuyo(makeKyureki(4, 1)); // 仏滅
    expect(result.timeSlots.morning).toBe("凶");
    expect(result.timeSlots.noon).toBe("凶");
    expect(result.timeSlots.afternoon).toBe("凶");
    expect(result.timeSlots.evening).toBe("凶");
  });

  it("六曜は6日周期で繰り返す", () => {
    const month = 1;
    const first = calcRokuyo(makeKyureki(month, 1));
    const seventh = calcRokuyo(makeKyureki(month, 7));
    expect(first.name).toBe(seventh.name);
  });
});
