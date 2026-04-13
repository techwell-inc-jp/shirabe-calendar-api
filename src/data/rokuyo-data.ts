/**
 * 六曜の定義データ
 */
import type { RokuyoInfo, RokuyoType } from "../core/types.js";

/**
 * 六曜のインデックス順序
 * (旧暦月 + 旧暦日) % 6 で算出
 * 0: 大安, 1: 赤口, 2: 先勝, 3: 友引, 4: 先負, 5: 仏滅
 */
export const ROKUYO_INDEX: readonly RokuyoType[] = [
  "大安",
  "赤口",
  "先勝",
  "友引",
  "先負",
  "仏滅",
];

/** 六曜の詳細データ */
export const ROKUYO_DATA: Record<RokuyoType, RokuyoInfo> = {
  大安: {
    name: "大安",
    reading: "たいあん",
    description: "終日吉。万事に良い日",
    timeSlots: { morning: "吉", noon: "吉", afternoon: "吉", evening: "吉" },
  },
  赤口: {
    name: "赤口",
    reading: "しゃっこう",
    description: "正午のみ吉。それ以外は凶",
    timeSlots: { morning: "凶", noon: "吉", afternoon: "凶", evening: "凶" },
  },
  先勝: {
    name: "先勝",
    reading: "せんしょう",
    description: "午前中が吉、午後は凶",
    timeSlots: {
      morning: "吉",
      noon: "吉",
      afternoon: "凶",
      evening: "凶",
    },
  },
  友引: {
    name: "友引",
    reading: "ともびき",
    description: "朝晩は吉、昼は凶。葬儀を避ける",
    timeSlots: {
      morning: "吉",
      noon: "凶",
      afternoon: "吉",
      evening: "吉",
    },
  },
  先負: {
    name: "先負",
    reading: "せんぶ",
    description: "午前は凶、午後は吉。控えめに過ごす",
    timeSlots: {
      morning: "凶",
      noon: "凶",
      afternoon: "吉",
      evening: "吉",
    },
  },
  仏滅: {
    name: "仏滅",
    reading: "ぶつめつ",
    description: "終日凶。万事に注意が必要",
    timeSlots: { morning: "凶", noon: "凶", afternoon: "凶", evening: "凶" },
  },
};
