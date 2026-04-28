/**
 * SEO Tier 化基盤(Layer A、PR #37)テスト
 *
 * 対象:
 * - getDayTier(year, currentYear) — 直近 2 年 = Tier 1, ±5 年 = Tier 2, それ以外 = Tier 3
 * - getPurposeMonthTier(year, month, currentYear) — year のみ判定(month 無視)
 * - SITEMAP_DAYS_PRIORITY / SITEMAP_DAYS_CHANGEFREQ
 * - SITEMAP_PURPOSES_PRIORITY / SITEMAP_PURPOSES_CHANGEFREQ
 */
import { describe, it, expect } from "vitest";
import {
  getDayTier,
  getPurposeMonthTier,
  SITEMAP_DAYS_CHANGEFREQ,
  SITEMAP_DAYS_PRIORITY,
  SITEMAP_PURPOSES_CHANGEFREQ,
  SITEMAP_PURPOSES_PRIORITY,
} from "../../src/data/tier.js";

describe("getDayTier (currentYear=2026 固定)", () => {
  it("currentYear (2026) は Tier 1", () => {
    expect(getDayTier(2026, 2026)).toBe(1);
  });

  it("currentYear + 1 (2027) は Tier 1", () => {
    expect(getDayTier(2027, 2026)).toBe(1);
  });

  it("currentYear - 1 (2025) は Tier 2(直近 2 年範囲外)", () => {
    expect(getDayTier(2025, 2026)).toBe(2);
  });

  it("currentYear + 2 (2028) は Tier 2", () => {
    expect(getDayTier(2028, 2026)).toBe(2);
  });

  it("currentYear - 5 (2021) は Tier 2(±5 年境界、含む)", () => {
    expect(getDayTier(2021, 2026)).toBe(2);
  });

  it("currentYear + 5 (2031) は Tier 2", () => {
    expect(getDayTier(2031, 2026)).toBe(2);
  });

  it("currentYear - 6 (2020) は Tier 3(±5 範囲外)", () => {
    expect(getDayTier(2020, 2026)).toBe(3);
  });

  it("currentYear + 6 (2032) は Tier 3", () => {
    expect(getDayTier(2032, 2026)).toBe(3);
  });

  it("歴史日付 1873 は Tier 3", () => {
    expect(getDayTier(1873, 2026)).toBe(3);
  });

  it("遠未来 2100 は Tier 3", () => {
    expect(getDayTier(2100, 2026)).toBe(3);
  });

  it("currentYear 引数を省略すると new Date() の年が使われる(default 動作)", () => {
    // 現在年 = 2026 と仮定(本テスト実行は 2026 年)
    const thisYear = new Date().getUTCFullYear();
    expect(getDayTier(thisYear)).toBe(1);
    expect(getDayTier(thisYear + 1)).toBe(1);
    expect(getDayTier(thisYear - 6)).toBe(3);
  });
});

describe("getPurposeMonthTier (year のみ判定、month 無視)", () => {
  it("currentYear (2026) は Tier 1(month 無視)", () => {
    expect(getPurposeMonthTier(2026, 1, 2026)).toBe(1);
    expect(getPurposeMonthTier(2026, 12, 2026)).toBe(1);
  });

  it("currentYear - 5 (2021) は Tier 2", () => {
    expect(getPurposeMonthTier(2021, 6, 2026)).toBe(2);
  });

  it("currentYear - 10 (2016) は Tier 3", () => {
    expect(getPurposeMonthTier(2016, 6, 2026)).toBe(3);
  });

  it("getDayTier と整合(year のみ判定で同じ結果)", () => {
    for (const y of [1873, 2010, 2020, 2021, 2025, 2026, 2027, 2028, 2031, 2032, 2100]) {
      expect(getPurposeMonthTier(y, 6, 2026)).toBe(getDayTier(y, 2026));
    }
  });
});

describe("SITEMAP_DAYS_PRIORITY / CHANGEFREQ table", () => {
  it("Tier 1 = priority 0.9 / changefreq weekly", () => {
    expect(SITEMAP_DAYS_PRIORITY[1]).toBe("0.9");
    expect(SITEMAP_DAYS_CHANGEFREQ[1]).toBe("weekly");
  });

  it("Tier 2 = priority 0.5 / changefreq yearly", () => {
    expect(SITEMAP_DAYS_PRIORITY[2]).toBe("0.5");
    expect(SITEMAP_DAYS_CHANGEFREQ[2]).toBe("yearly");
  });

  it("Tier 3 = priority 0.3 / changefreq yearly", () => {
    expect(SITEMAP_DAYS_PRIORITY[3]).toBe("0.3");
    expect(SITEMAP_DAYS_CHANGEFREQ[3]).toBe("yearly");
  });

  it("priority は Tier 1 > Tier 2 > Tier 3 で降順(降順 signal が Google + AI への明示信号)", () => {
    expect(parseFloat(SITEMAP_DAYS_PRIORITY[1])).toBeGreaterThan(parseFloat(SITEMAP_DAYS_PRIORITY[2]));
    expect(parseFloat(SITEMAP_DAYS_PRIORITY[2])).toBeGreaterThan(parseFloat(SITEMAP_DAYS_PRIORITY[3]));
  });
});

describe("SITEMAP_PURPOSES_PRIORITY / CHANGEFREQ table", () => {
  it("Tier 1 = priority 0.8 / changefreq monthly", () => {
    expect(SITEMAP_PURPOSES_PRIORITY[1]).toBe("0.8");
    expect(SITEMAP_PURPOSES_CHANGEFREQ[1]).toBe("monthly");
  });

  it("Tier 2 = priority 0.6 / changefreq monthly(現状 default 維持)", () => {
    expect(SITEMAP_PURPOSES_PRIORITY[2]).toBe("0.6");
    expect(SITEMAP_PURPOSES_CHANGEFREQ[2]).toBe("monthly");
  });

  it("Tier 3 = priority 0.4 / changefreq monthly", () => {
    expect(SITEMAP_PURPOSES_PRIORITY[3]).toBe("0.4");
    expect(SITEMAP_PURPOSES_CHANGEFREQ[3]).toBe("monthly");
  });

  it("全 Tier で changefreq monthly(月別ランキングの性質上)", () => {
    expect(SITEMAP_PURPOSES_CHANGEFREQ[1]).toBe(SITEMAP_PURPOSES_CHANGEFREQ[2]);
    expect(SITEMAP_PURPOSES_CHANGEFREQ[2]).toBe(SITEMAP_PURPOSES_CHANGEFREQ[3]);
  });

  it("priority は降順(0.8 > 0.6 > 0.4)", () => {
    expect(parseFloat(SITEMAP_PURPOSES_PRIORITY[1])).toBeGreaterThan(parseFloat(SITEMAP_PURPOSES_PRIORITY[2]));
    expect(parseFloat(SITEMAP_PURPOSES_PRIORITY[2])).toBeGreaterThan(parseFloat(SITEMAP_PURPOSES_PRIORITY[3]));
  });
});

describe("days vs purposes priority 比較", () => {
  it("Tier 1 days (0.9) > Tier 1 purposes (0.8)", () => {
    expect(parseFloat(SITEMAP_DAYS_PRIORITY[1])).toBeGreaterThan(
      parseFloat(SITEMAP_PURPOSES_PRIORITY[1])
    );
  });

  it("Tier 2 days (0.5) < Tier 2 purposes (0.6)", () => {
    // 用途別ランキングは中期需要でも individual day より AI 引用価値が高め
    expect(parseFloat(SITEMAP_DAYS_PRIORITY[2])).toBeLessThan(
      parseFloat(SITEMAP_PURPOSES_PRIORITY[2])
    );
  });
});
