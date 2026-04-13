/**
 * 干支（十干十二支）の定義データ
 */
import type { JikkanType, JunishiType } from "../core/types.js";

/** 十干の読み */
export const JIKKAN_READINGS: Record<JikkanType, string> = {
  甲: "きのえ",
  乙: "きのと",
  丙: "ひのえ",
  丁: "ひのと",
  戊: "つちのえ",
  己: "つちのと",
  庚: "かのえ",
  辛: "かのと",
  壬: "みずのえ",
  癸: "みずのと",
};

/** 十二支の読み */
export const JUNISHI_READINGS: Record<JunishiType, string> = {
  子: "ね",
  丑: "うし",
  寅: "とら",
  卯: "う",
  辰: "たつ",
  巳: "み",
  午: "うま",
  未: "ひつじ",
  申: "さる",
  酉: "とり",
  戌: "いぬ",
  亥: "い",
};

/** 十二支の動物名 */
export const JUNISHI_ANIMALS: Record<
  JunishiType,
  { ja: string; en: string }
> = {
  子: { ja: "鼠", en: "Rat" },
  丑: { ja: "牛", en: "Ox" },
  寅: { ja: "虎", en: "Tiger" },
  卯: { ja: "兎", en: "Rabbit" },
  辰: { ja: "龍", en: "Dragon" },
  巳: { ja: "蛇", en: "Snake" },
  午: { ja: "馬", en: "Horse" },
  未: { ja: "羊", en: "Sheep" },
  申: { ja: "猿", en: "Monkey" },
  酉: { ja: "鶏", en: "Rooster" },
  戌: { ja: "犬", en: "Dog" },
  亥: { ja: "猪", en: "Boar" },
};
