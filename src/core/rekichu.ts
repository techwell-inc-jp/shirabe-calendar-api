/**
 * 暦注判定
 *
 * 六曜・干支・二十四節気・旧暦の情報から各種暦注を判定する。
 */
import type {
  KyurekiDate,
  KanshiInfo,
  RekichuInfo,
  JunishiType,
} from "./types.js";
import {
  REKICHU_DEFINITIONS,
  ICHIRYUMANBAIBI_TABLE,
  TENSHANICHI_TABLE,
  DAIMYONICHI_INDICES,
  BOSONICHI_TABLE,
  TENONNICHI_INDICES,
  FUJOJUBI_TABLE,
  SANRINBO_TABLE,
  JUSHINICHI_TABLE,
  JUSSHINICHI_TABLE,
} from "../data/rekichu-rules.js";
import { getCurrentSekkiPeriod, getSeason } from "./sekki.js";

/**
 * 指定日の暦注をすべて判定する
 * @param year 西暦年
 * @param month 月
 * @param day 日
 * @param kyureki 旧暦日付
 * @param kanshi 干支情報
 * @returns 該当する暦注のリスト
 */
export function judgeRekichu(
  year: number,
  month: number,
  day: number,
  kyureki: KyurekiDate,
  kanshi: KanshiInfo
): RekichuInfo[] {
  const results: RekichuInfo[] = [];

  // 吉日判定
  if (isIchiryumanbaibi(year, month, day, kanshi)) {
    results.push(REKICHU_DEFINITIONS["一粒万倍日"]);
  }
  if (isTenshanichi(year, month, day, kanshi)) {
    results.push(REKICHU_DEFINITIONS["天赦日"]);
  }
  if (isDaimyonichi(kanshi)) {
    results.push(REKICHU_DEFINITIONS["大明日"]);
  }
  if (isBosonichi(kyureki, kanshi)) {
    results.push(REKICHU_DEFINITIONS["母倉日"]);
  }
  if (isTenonnichi(kanshi)) {
    results.push(REKICHU_DEFINITIONS["天恩日"]);
  }
  if (isToraNoHi(kanshi)) {
    results.push(REKICHU_DEFINITIONS["寅の日"]);
  }
  if (isMiNoHi(kanshi)) {
    // 己巳の日は巳の日の特殊版
    if (isTsuchinotoMi(kanshi)) {
      results.push(REKICHU_DEFINITIONS["己巳の日"]);
    } else {
      results.push(REKICHU_DEFINITIONS["巳の日"]);
    }
  }
  if (isKinoeNe(kanshi)) {
    results.push(REKICHU_DEFINITIONS["甲子の日"]);
  }

  // 凶日判定
  if (isFujojubi(kyureki)) {
    results.push(REKICHU_DEFINITIONS["不成就日"]);
  }
  if (isSanrinbo(kyureki, kanshi)) {
    results.push(REKICHU_DEFINITIONS["三隣亡"]);
  }
  if (isJushinichi(kyureki, kanshi)) {
    results.push(REKICHU_DEFINITIONS["受死日"]);
  }
  if (isJusshinichi(kyureki, kanshi)) {
    results.push(REKICHU_DEFINITIONS["十死日"]);
  }

  return results;
}

// ============================================================
// 吉日判定
// ============================================================

/**
 * 一粒万倍日の判定
 * 二十四節気の期間ごとに決まった十二支の日
 */
function isIchiryumanbaibi(
  year: number,
  month: number,
  day: number,
  kanshi: KanshiInfo
): boolean {
  const currentSekki = getCurrentSekkiPeriod(year, month, day);
  const entry = ICHIRYUMANBAIBI_TABLE.find(
    (e) => e.sekkiStart === currentSekki
  );
  if (!entry) return false;
  return entry.junishi.includes(kanshi.junishi);
}

/**
 * 天赦日の判定
 * 季節×日干支の組み合わせ
 */
function isTenshanichi(
  year: number,
  month: number,
  day: number,
  kanshi: KanshiInfo
): boolean {
  const season = getSeason(year, month, day);
  const entry = TENSHANICHI_TABLE.find((e) => e.seasonStart === season);
  if (!entry) return false;

  const jikkanIndex = kanshi.index % 10;
  const junishiIndex = kanshi.index % 12;
  return (
    jikkanIndex === entry.jikkanIndex && junishiIndex === entry.junishiIndex
  );
}

/**
 * 大明日の判定
 * 特定の60干支インデックス
 */
function isDaimyonichi(kanshi: KanshiInfo): boolean {
  return DAIMYONICHI_INDICES.includes(kanshi.index);
}

/**
 * 母倉日の判定
 * 旧暦月と日の十二支の組み合わせ
 */
function isBosonichi(kyureki: KyurekiDate, kanshi: KanshiInfo): boolean {
  const junishiList = BOSONICHI_TABLE[kyureki.month];
  if (!junishiList) return false;
  return junishiList.includes(kanshi.junishi);
}

/**
 * 天恩日の判定
 * 60干支周期の特定インデックス
 */
function isTenonnichi(kanshi: KanshiInfo): boolean {
  return TENONNICHI_INDICES.includes(kanshi.index);
}

/**
 * 寅の日の判定
 */
function isToraNoHi(kanshi: KanshiInfo): boolean {
  return kanshi.junishi === "寅";
}

/**
 * 巳の日の判定
 */
function isMiNoHi(kanshi: KanshiInfo): boolean {
  return kanshi.junishi === "巳";
}

/**
 * 己巳の日の判定
 */
function isTsuchinotoMi(kanshi: KanshiInfo): boolean {
  return kanshi.jikkan === "己" && kanshi.junishi === "巳";
}

/**
 * 甲子の日の判定
 */
function isKinoeNe(kanshi: KanshiInfo): boolean {
  return kanshi.jikkan === "甲" && kanshi.junishi === "子";
}

// ============================================================
// 凶日判定
// ============================================================

/**
 * 不成就日の判定
 * 旧暦月ごとの固定パターン（旧暦日）
 */
function isFujojubi(kyureki: KyurekiDate): boolean {
  const days = FUJOJUBI_TABLE[kyureki.month];
  if (!days) return false;
  return days.includes(kyureki.day);
}

/**
 * 三隣亡の判定
 * 旧暦月ごとの固定十二支
 */
function isSanrinbo(kyureki: KyurekiDate, kanshi: KanshiInfo): boolean {
  const junishi = SANRINBO_TABLE[kyureki.month] as JunishiType | undefined;
  if (!junishi) return false;
  return kanshi.junishi === junishi;
}

/**
 * 受死日の判定
 * 旧暦月ごとの固定十二支
 */
function isJushinichi(kyureki: KyurekiDate, kanshi: KanshiInfo): boolean {
  const junishi = JUSHINICHI_TABLE[kyureki.month] as JunishiType | undefined;
  if (!junishi) return false;
  return kanshi.junishi === junishi;
}

/**
 * 十死日の判定
 * 旧暦月ごとの固定十二支
 */
function isJusshinichi(kyureki: KyurekiDate, kanshi: KanshiInfo): boolean {
  const junishi = JUSSHINICHI_TABLE[kyureki.month] as JunishiType | undefined;
  if (!junishi) return false;
  return kanshi.junishi === junishi;
}
