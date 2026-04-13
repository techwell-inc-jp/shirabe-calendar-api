/**
 * 干支計算のテスト
 */
import { describe, it, expect } from "vitest";
import { calcKanshi } from "../../src/core/kanshi.js";

describe("calcKanshi", () => {
  it("干支の60日周期が正しい", () => {
    const first = calcKanshi(2026, 1, 1);
    const sixtieth = calcKanshi(2026, 3, 2); // 60日後
    expect(first.index).toBe(sixtieth.index);
  });

  it("連続する日付で干支インデックスが1ずつ増える", () => {
    const d1 = calcKanshi(2026, 4, 12);
    const d2 = calcKanshi(2026, 4, 13);
    expect((d1.index + 1) % 60).toBe(d2.index);
  });

  it("十干が10個、十二支が12個の正しい名前を返す", () => {
    const jikkanSet = new Set<string>();
    const junishiSet = new Set<string>();

    for (let i = 0; i < 60; i++) {
      // 2026/1/1 から60日間
      const date = new Date(2026, 0, 1 + i);
      const result = calcKanshi(
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate()
      );
      jikkanSet.add(result.jikkan);
      junishiSet.add(result.junishi);
    }

    expect(jikkanSet.size).toBe(10);
    expect(junishiSet.size).toBe(12);
  });

  it("干支のfull名は十干+十二支の組み合わせ", () => {
    const result = calcKanshi(2026, 4, 12);
    expect(result.full).toBe(`${result.jikkan}${result.junishi}`);
  });

  it("十二支の動物名が返される", () => {
    const result = calcKanshi(2026, 4, 12);
    expect(result.junishiAnimal.ja).toBeTruthy();
    expect(result.junishiAnimal.en).toBeTruthy();
  });

  it("インデックスは0-59の範囲", () => {
    for (let d = 1; d <= 30; d++) {
      const result = calcKanshi(2026, 4, d);
      expect(result.index).toBeGreaterThanOrEqual(0);
      expect(result.index).toBeLessThanOrEqual(59);
    }
  });

  it("甲子の日が正しく検出される", () => {
    // 甲子 = index 0
    // 甲子の日を探す
    let found = false;
    for (let d = 1; d <= 60; d++) {
      const date = new Date(2026, 0, d);
      const result = calcKanshi(
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate()
      );
      if (result.index === 0) {
        expect(result.jikkan).toBe("甲");
        expect(result.junishi).toBe("子");
        expect(result.full).toBe("甲子");
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
