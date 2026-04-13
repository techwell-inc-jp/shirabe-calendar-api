/**
 * 二十四節気の定義データ
 *
 * 太陽黄経の角度順に定義。
 * 春分点（黄経0度）を起点とする。
 */
import type { SekkiName } from "../core/types.js";

export type SekkiDefinition = {
  name: SekkiName;
  reading: string;
  description: string;
  /** 太陽黄経（度） */
  longitude: number;
};

/**
 * 二十四節気の定義（太陽黄経順）
 * 黄経0度=春分から15度刻み
 */
export const SEKKI_DEFINITIONS: readonly SekkiDefinition[] = [
  {
    name: "春分",
    reading: "しゅんぶん",
    description: "昼と夜の長さがほぼ等しくなる日",
    longitude: 0,
  },
  {
    name: "清明",
    reading: "せいめい",
    description: "万物が清らかで明るく生き生きとする頃",
    longitude: 15,
  },
  {
    name: "穀雨",
    reading: "こくう",
    description: "穀物を潤す春の雨が降る頃",
    longitude: 30,
  },
  {
    name: "立夏",
    reading: "りっか",
    description: "夏の始まり。新緑の季節",
    longitude: 45,
  },
  {
    name: "小満",
    reading: "しょうまん",
    description: "万物が次第に成長し、天地に満ち始める頃",
    longitude: 60,
  },
  {
    name: "芒種",
    reading: "ぼうしゅ",
    description: "稲や麦など芒のある穀物の種を蒔く頃",
    longitude: 75,
  },
  {
    name: "夏至",
    reading: "げし",
    description: "一年で最も昼が長い日",
    longitude: 90,
  },
  {
    name: "小暑",
    reading: "しょうしょ",
    description: "暑さが次第に強くなる頃。梅雨明け間近",
    longitude: 105,
  },
  {
    name: "大暑",
    reading: "たいしょ",
    description: "一年で最も暑さが厳しい頃",
    longitude: 120,
  },
  {
    name: "立秋",
    reading: "りっしゅう",
    description: "秋の始まり。暑さの中にも秋の気配が漂う",
    longitude: 135,
  },
  {
    name: "処暑",
    reading: "しょしょ",
    description: "暑さがおさまり始める頃",
    longitude: 150,
  },
  {
    name: "白露",
    reading: "はくろ",
    description: "草花に朝露が宿り始める頃",
    longitude: 165,
  },
  {
    name: "秋分",
    reading: "しゅうぶん",
    description: "昼と夜の長さがほぼ等しくなる日",
    longitude: 180,
  },
  {
    name: "寒露",
    reading: "かんろ",
    description: "露が冷たく感じられる頃。秋が深まる",
    longitude: 195,
  },
  {
    name: "霜降",
    reading: "そうこう",
    description: "霜が降り始める頃。晩秋の候",
    longitude: 210,
  },
  {
    name: "立冬",
    reading: "りっとう",
    description: "冬の始まり。冬の気配が立ち始める頃",
    longitude: 225,
  },
  {
    name: "小雪",
    reading: "しょうせつ",
    description: "わずかに雪が降り始める頃",
    longitude: 240,
  },
  {
    name: "大雪",
    reading: "たいせつ",
    description: "本格的に雪が降り始める頃",
    longitude: 255,
  },
  {
    name: "冬至",
    reading: "とうじ",
    description: "一年で最も昼が短い日",
    longitude: 270,
  },
  {
    name: "小寒",
    reading: "しょうかん",
    description: "寒さが次第に厳しくなる頃。寒の入り",
    longitude: 285,
  },
  {
    name: "大寒",
    reading: "だいかん",
    description: "一年で最も寒さが厳しい頃",
    longitude: 300,
  },
  {
    name: "立春",
    reading: "りっしゅん",
    description: "春の始まり。暦の上で春が始まる日",
    longitude: 315,
  },
  {
    name: "雨水",
    reading: "うすい",
    description: "雪が雨に変わり、氷が解けて水になる頃",
    longitude: 330,
  },
  {
    name: "啓蟄",
    reading: "けいちつ",
    description: "冬ごもりしていた虫が地上に出てくる頃",
    longitude: 345,
  },
];
