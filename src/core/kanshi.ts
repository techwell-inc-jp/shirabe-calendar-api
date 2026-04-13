/**
 * 干支（十干十二支）計算
 *
 * ユリウス通日から日干支を算出する。
 * 60干支のインデックスは (JD + 49) % 60 で算出。
 * （甲子の日 JD = 11 として、(11 + 49) % 60 = 0 = 甲子）
 */
import { JIKKAN, JUNISHI, type KanshiInfo } from "./types.js";
import { JUNISHI_ANIMALS } from "../data/kanshi-data.js";
import { gregorianToJD } from "./kyureki.js";

/** 干支のオフセット: JD → 60干支インデックス変換用 */
const KANSHI_OFFSET = 49;

/**
 * グレゴリオ暦の日付から日干支を算出する
 * @param year 西暦年
 * @param month 月（1-12）
 * @param day 日（1-31）
 * @returns 干支情報
 */
export function calcKanshi(
  year: number,
  month: number,
  day: number
): KanshiInfo {
  const jd = gregorianToJD(year, month, day);
  const index = ((Math.floor(jd + 0.5) + KANSHI_OFFSET) % 60 + 60) % 60;

  const jikkanIndex = index % 10;
  const junishiIndex = index % 12;

  const jikkan = JIKKAN[jikkanIndex];
  const junishi = JUNISHI[junishiIndex];

  return {
    full: `${jikkan}${junishi}`,
    jikkan,
    junishi,
    junishiAnimal: JUNISHI_ANIMALS[junishi],
    index,
  };
}
