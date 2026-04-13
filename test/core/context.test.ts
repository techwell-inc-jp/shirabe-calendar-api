/**
 * コンテキスト判定のテスト
 */
import { describe, it, expect } from "vitest";
import { generateContext, generateSummary } from "../../src/core/context.js";
import type { RekichuInfo, Category } from "../../src/core/types.js";
import { ROKUYO_DATA } from "../../src/data/rokuyo-data.js";
import { REKICHU_DEFINITIONS } from "../../src/data/rekichu-rules.js";

const ALL_CATEGORIES: Category[] = [
  "wedding", "funeral", "moving", "construction",
  "business", "car_delivery", "marriage_registration", "travel",
];

describe("generateContext", () => {
  it("大安で暦注なしの場合、全カテゴリが吉以上", () => {
    const rokuyo = ROKUYO_DATA["大安"];
    const result = generateContext(rokuyo, [], ALL_CATEGORIES);

    for (const [name, judgment] of Object.entries(result)) {
      if (name === "葬儀") continue; // 大安でも葬儀は別
      expect(judgment.score).toBeGreaterThanOrEqual(7);
      expect(["大吉", "吉"]).toContain(judgment.judgment);
    }
  });

  it("仏滅で暦注なしの場合、スコアが低い", () => {
    const rokuyo = ROKUYO_DATA["仏滅"];
    const result = generateContext(rokuyo, [], ALL_CATEGORIES);

    for (const [name, judgment] of Object.entries(result)) {
      if (name === "葬儀") continue;
      expect(judgment.score).toBeLessThanOrEqual(4);
    }
  });

  it("大安 + 一粒万倍日 = 結婚が大吉、スコア10", () => {
    const rokuyo = ROKUYO_DATA["大安"];
    const rekichu: RekichuInfo[] = [REKICHU_DEFINITIONS["一粒万倍日"]];
    const result = generateContext(rokuyo, rekichu, ["wedding"]);

    expect(result["結婚"].judgment).toBe("大吉");
    expect(result["結婚"].score).toBe(10);
  });

  it("天赦日はすべての凶を打ち消す", () => {
    const rokuyo = ROKUYO_DATA["仏滅"];
    const rekichu: RekichuInfo[] = [
      REKICHU_DEFINITIONS["天赦日"],
      REKICHU_DEFINITIONS["不成就日"],
      REKICHU_DEFINITIONS["受死日"],
    ];
    const result = generateContext(rokuyo, rekichu, ["wedding"]);

    // 天赦日が凶を打ち消すので、凶・大凶にはならない
    expect(["大吉", "吉", "小吉", "問題なし"]).toContain(result["結婚"].judgment);
  });

  it("不成就日は判定を1段階下げる", () => {
    const rokuyo = ROKUYO_DATA["大安"];
    const withoutFujojubi = generateContext(rokuyo, [], ["business"]);
    const withFujojubi = generateContext(
      rokuyo,
      [REKICHU_DEFINITIONS["不成就日"]],
      ["business"]
    );

    expect(withFujojubi["開業"].score).toBeLessThan(withoutFujojubi["開業"].score);
  });

  it("三隣亡は建築のみに影響する", () => {
    const rokuyo = ROKUYO_DATA["大安"];
    const rekichu: RekichuInfo[] = [REKICHU_DEFINITIONS["三隣亡"]];

    const result = generateContext(rokuyo, rekichu, ["construction", "wedding"]);

    // 建築はスコアが低い
    expect(result["建築着工"].score).toBeLessThanOrEqual(5);
    // 結婚には影響なし（大安のまま）
    expect(result["結婚"].score).toBeGreaterThanOrEqual(7);
  });

  it("レスポンスにjudgment, note, scoreが含まれる", () => {
    const rokuyo = ROKUYO_DATA["大安"];
    const result = generateContext(rokuyo, [], ["wedding"]);

    expect(result["結婚"]).toHaveProperty("judgment");
    expect(result["結婚"]).toHaveProperty("note");
    expect(result["結婚"]).toHaveProperty("score");
    expect(typeof result["結婚"].note).toBe("string");
    expect(result["結婚"].note.length).toBeGreaterThan(0);
  });

  it("スコアは1〜10の範囲", () => {
    const rokuyo = ROKUYO_DATA["仏滅"];
    const rekichu: RekichuInfo[] = [
      REKICHU_DEFINITIONS["不成就日"],
      REKICHU_DEFINITIONS["受死日"],
      REKICHU_DEFINITIONS["十死日"],
    ];
    const result = generateContext(rokuyo, rekichu, ALL_CATEGORIES);

    for (const judgment of Object.values(result)) {
      expect(judgment.score).toBeGreaterThanOrEqual(1);
      expect(judgment.score).toBeLessThanOrEqual(10);
    }
  });
});

describe("generateSummary", () => {
  it("サマリーが文字列で返される", () => {
    const rokuyo = ROKUYO_DATA["大安"];
    const context = generateContext(rokuyo, [], ALL_CATEGORIES);
    const summary = generateSummary(rokuyo, [], context);

    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });

  it("サマリーに六曜名が含まれる", () => {
    const rokuyo = ROKUYO_DATA["大安"];
    const context = generateContext(rokuyo, [], ALL_CATEGORIES);
    const summary = generateSummary(rokuyo, [], context);

    expect(summary).toContain("大安");
  });

  it("天赦日がある場合、サマリーに天赦日が含まれる", () => {
    const rokuyo = ROKUYO_DATA["大安"];
    const rekichu: RekichuInfo[] = [REKICHU_DEFINITIONS["天赦日"]];
    const context = generateContext(rokuyo, rekichu, ALL_CATEGORIES);
    const summary = generateSummary(rokuyo, rekichu, context);

    expect(summary).toContain("天赦日");
  });
});
