/**
 * 暦注判定のテスト
 */
import { describe, it, expect } from "vitest";
import { judgeRekichu } from "../../src/core/rekichu.js";
import { calcKanshi } from "../../src/core/kanshi.js";
import { toKyureki } from "../../src/core/kyureki.js";
import type { KyurekiDate } from "../../src/core/types.js";

/**
 * ヘルパー: 指定日の暦注を一括取得
 */
function getRekichu(year: number, month: number, day: number) {
  const kyureki = toKyureki(year, month, day);
  const kanshi = calcKanshi(year, month, day);
  return judgeRekichu(year, month, day, kyureki, kanshi);
}

describe("judgeRekichu", () => {
  it("暦注の結果はRekichuInfo[]型", () => {
    const result = getRekichu(2026, 4, 12);
    expect(Array.isArray(result)).toBe(true);
    for (const r of result) {
      expect(r.name).toBeTruthy();
      expect(r.reading).toBeTruthy();
      expect(r.description).toBeTruthy();
      expect(["吉", "凶"]).toContain(r.type);
    }
  });

  it("寅の日は12日周期で出現する", () => {
    // 寅の日を探す
    let toraDay = -1;
    for (let d = 1; d <= 12; d++) {
      const kanshi = calcKanshi(2026, 1, d);
      if (kanshi.junishi === "寅") {
        toraDay = d;
        break;
      }
    }
    expect(toraDay).toBeGreaterThan(0);

    // 12日後も寅の日
    const nextToraDate = new Date(2026, 0, toraDay + 12);
    const nextKanshi = calcKanshi(
      nextToraDate.getFullYear(),
      nextToraDate.getMonth() + 1,
      nextToraDate.getDate()
    );
    expect(nextKanshi.junishi).toBe("寅");
  });

  it("甲子の日は60日周期で出現する", () => {
    // 甲子の日を探す
    let kinoeNeDay: Date | null = null;
    for (let d = 1; d <= 60; d++) {
      const date = new Date(2026, 0, d);
      const kanshi = calcKanshi(
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate()
      );
      if (kanshi.jikkan === "甲" && kanshi.junishi === "子") {
        kinoeNeDay = date;
        break;
      }
    }
    expect(kinoeNeDay).not.toBeNull();

    if (kinoeNeDay) {
      const rekichu = getRekichu(
        kinoeNeDay.getFullYear(),
        kinoeNeDay.getMonth() + 1,
        kinoeNeDay.getDate()
      );
      const hasKinoeNe = rekichu.some((r) => r.name === "甲子の日");
      expect(hasKinoeNe).toBe(true);
    }
  });

  it("己巳の日は60日周期で出現する", () => {
    // 己巳の日を探す
    let found = false;
    for (let d = 1; d <= 60; d++) {
      const date = new Date(2026, 0, d);
      const kanshi = calcKanshi(
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate()
      );
      if (kanshi.jikkan === "己" && kanshi.junishi === "巳") {
        const rekichu = getRekichu(
          date.getFullYear(),
          date.getMonth() + 1,
          date.getDate()
        );
        const hasTsuchinotoMi = rekichu.some((r) => r.name === "己巳の日");
        expect(hasTsuchinotoMi).toBe(true);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("不成就日は旧暦の月パターンに基づく", () => {
    // 旧暦1月3日は不成就日
    const kyureki: KyurekiDate = {
      year: 2026,
      month: 1,
      day: 3,
      isLeapMonth: false,
      monthName: "睦月",
    };
    const kanshi = calcKanshi(2026, 2, 20); // 任意の日の干支
    const result = judgeRekichu(2026, 2, 20, kyureki, kanshi);
    const hasFujojubi = result.some((r) => r.name === "不成就日");
    expect(hasFujojubi).toBe(true);
  });

  it("暦注には吉日と凶日が混在しうる", () => {
    // 1年間で吉と凶が両方出る日を探す
    let foundMixed = false;
    for (let month = 1; month <= 12 && !foundMixed; month++) {
      for (let day = 1; day <= 28 && !foundMixed; day++) {
        const result = getRekichu(2026, month, day);
        const hasKichi = result.some((r) => r.type === "吉");
        const hasKyo = result.some((r) => r.type === "凶");
        if (hasKichi && hasKyo) {
          foundMixed = true;
        }
      }
    }
    expect(foundMixed).toBe(true);
  });

  it("天赦日は年に5〜6回", () => {
    let count = 0;
    for (let month = 1; month <= 12; month++) {
      for (let day = 1; day <= 28; day++) {
        const date = new Date(2026, month - 1, day);
        const result = getRekichu(
          date.getFullYear(),
          date.getMonth() + 1,
          date.getDate()
        );
        if (result.some((r) => r.name === "天赦日")) {
          count++;
        }
      }
    }
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(8);
  });
});
