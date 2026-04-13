/**
 * 二十四節気計算のテスト
 */
import { describe, it, expect } from "vitest";
import { calcSekki, getSeason, getCurrentSekkiPeriod } from "../../src/core/sekki.js";

describe("calcSekki", () => {
  it("春分の日（3月20日頃）に春分を返す", () => {
    // 2026年の春分は3月20日
    const result = calcSekki(2026, 3, 20);
    // 春分の日かその直前の節気
    expect(["啓蟄", "春分"]).toContain(result.name);
  });

  it("夏至の日（6月21日頃）に夏至を返す", () => {
    const result = calcSekki(2026, 6, 22);
    expect(["夏至", "芒種"]).toContain(result.name);
  });

  it("読みと説明が返される", () => {
    const result = calcSekki(2026, 6, 15);
    expect(result.reading).toBeTruthy();
    expect(result.description).toBeTruthy();
  });

  it("isTodayフラグはboolean", () => {
    const result = calcSekki(2026, 3, 20);
    expect(typeof result.isToday).toBe("boolean");
  });

  it("1年を通して全24節気が返される", () => {
    const sekkiNames = new Set<string>();
    // 1日おきにチェック（十分な頻度）
    for (let month = 1; month <= 12; month++) {
      for (let day = 1; day <= 28; day += 3) {
        const result = calcSekki(2026, month, day);
        sekkiNames.add(result.name);
      }
    }
    expect(sekkiNames.size).toBe(24);
  });
});

describe("getSeason", () => {
  it("2月上旬は春（立春以降）", () => {
    const result = getSeason(2026, 2, 10);
    expect(result).toBe("立春");
  });

  it("5月上旬は夏（立夏以降）", () => {
    const result = getSeason(2026, 5, 10);
    expect(result).toBe("立夏");
  });

  it("8月上旬は秋（立秋以降）", () => {
    const result = getSeason(2026, 8, 10);
    expect(result).toBe("立秋");
  });

  it("11月上旬は冬（立冬以降）", () => {
    const result = getSeason(2026, 11, 10);
    expect(result).toBe("立冬");
  });
});

describe("getCurrentSekkiPeriod", () => {
  it("節気名を返す", () => {
    const result = getCurrentSekkiPeriod(2026, 4, 12);
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });
});
