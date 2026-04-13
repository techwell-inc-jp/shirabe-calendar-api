/**
 * Shirabe Calendar API — 型定義
 */

// ============================================================
// 基本型
// ============================================================

/** 対応する日付範囲 */
export const DATE_RANGE = {
  MIN: "1873-01-01",
  MAX: "2100-12-31",
} as const;

/** 曜日 */
export type DayOfWeek = {
  ja: string;
  en: string;
};

// ============================================================
// 旧暦
// ============================================================

/** 旧暦の月名（和名） */
export const KYUREKI_MONTH_NAMES = [
  "睦月",
  "如月",
  "弥生",
  "卯月",
  "皐月",
  "水無月",
  "文月",
  "葉月",
  "長月",
  "神無月",
  "霜月",
  "師走",
] as const;

/** 旧暦日付 */
export type KyurekiDate = {
  /** 旧暦年 */
  year: number;
  /** 旧暦月（1-12） */
  month: number;
  /** 旧暦日（1-30） */
  day: number;
  /** 閏月かどうか */
  isLeapMonth: boolean;
  /** 月名（睦月〜師走） */
  monthName: string;
};

// ============================================================
// 六曜
// ============================================================

/** 六曜の種類 */
export const ROKUYO_TYPES = [
  "大安",
  "赤口",
  "先勝",
  "友引",
  "先負",
  "仏滅",
] as const;

export type RokuyoType = (typeof ROKUYO_TYPES)[number];

/** 吉凶 */
export type Fortune = "吉" | "凶" | "小吉";

/** 時間帯別の吉凶 */
export type TimeSlots = {
  morning: Fortune;
  noon: Fortune;
  afternoon: Fortune;
  evening: Fortune;
};

/** 六曜情報 */
export type RokuyoInfo = {
  name: RokuyoType;
  reading: string;
  description: string;
  timeSlots: TimeSlots;
};

// ============================================================
// 干支（十干十二支）
// ============================================================

/** 十干 */
export const JIKKAN = [
  "甲",
  "乙",
  "丙",
  "丁",
  "戊",
  "己",
  "庚",
  "辛",
  "壬",
  "癸",
] as const;

export type JikkanType = (typeof JIKKAN)[number];

/** 十二支 */
export const JUNISHI = [
  "子",
  "丑",
  "寅",
  "卯",
  "辰",
  "巳",
  "午",
  "未",
  "申",
  "酉",
  "戌",
  "亥",
] as const;

export type JunishiType = (typeof JUNISHI)[number];

/** 干支情報 */
export type KanshiInfo = {
  /** 干支（例: 甲子） */
  full: string;
  /** 十干 */
  jikkan: JikkanType;
  /** 十二支 */
  junishi: JunishiType;
  /** 十二支の動物名 */
  junishiAnimal: {
    ja: string;
    en: string;
  };
  /** 60干支のインデックス（0-59） */
  index: number;
};

// ============================================================
// 二十四節気
// ============================================================

/** 二十四節気の名前 */
export const SEKKI_NAMES = [
  "小寒",
  "大寒",
  "立春",
  "雨水",
  "啓蟄",
  "春分",
  "清明",
  "穀雨",
  "立夏",
  "小満",
  "芒種",
  "夏至",
  "小暑",
  "大暑",
  "立秋",
  "処暑",
  "白露",
  "秋分",
  "寒露",
  "霜降",
  "立冬",
  "小雪",
  "大雪",
  "冬至",
] as const;

export type SekkiName = (typeof SEKKI_NAMES)[number];

/** 二十四節気情報 */
export type SekkiInfo = {
  /** 節気名 */
  name: SekkiName;
  /** 読み */
  reading: string;
  /** 説明 */
  description: string;
  /** 指定日が節気の当日かどうか */
  isToday: boolean;
};

// ============================================================
// 暦注
// ============================================================

/** 暦注の吉凶区分 */
export type RekichuType = "吉" | "凶";

/** 暦注名（吉日） */
export type KichiRekichu =
  | "一粒万倍日"
  | "天赦日"
  | "大明日"
  | "母倉日"
  | "天恩日"
  | "寅の日"
  | "巳の日"
  | "己巳の日"
  | "甲子の日";

/** 暦注名（凶日） */
export type KyoRekichu = "不成就日" | "三隣亡" | "受死日" | "十死日";

/** 暦注名 */
export type RekichuName = KichiRekichu | KyoRekichu;

/** 暦注情報 */
export type RekichuInfo = {
  name: RekichuName;
  reading: string;
  description: string;
  type: RekichuType;
};

// ============================================================
// コンテキスト（用途別吉凶判定）
// ============================================================

/** 用途カテゴリ */
export const CATEGORIES = [
  "wedding",
  "funeral",
  "moving",
  "construction",
  "business",
  "car_delivery",
  "marriage_registration",
  "travel",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** カテゴリの日本語名マッピング */
export const CATEGORY_JA: Record<Category, string> = {
  wedding: "結婚・結納",
  funeral: "葬儀・法事",
  moving: "引っ越し・転居",
  construction: "建築着工・上棟",
  business: "開業・契約",
  car_delivery: "納車",
  marriage_registration: "入籍",
  travel: "旅行出発",
};

/** 判定値 */
export const JUDGMENT_VALUES = [
  "大吉",
  "吉",
  "小吉",
  "問題なし",
  "注意",
  "凶",
  "大凶",
] as const;

export type JudgmentValue = (typeof JUDGMENT_VALUES)[number];

/** コンテキスト判定結果 */
export type ContextJudgment = {
  judgment: JudgmentValue;
  note: string;
  score: number;
};

// ============================================================
// 統合レスポンス
// ============================================================

/** 和暦の元号 */
export type WarekiEra = "明治" | "大正" | "昭和" | "平成" | "令和";

/** 単日カレンダーレスポンス */
export type CalendarResponse = {
  date: string;
  wareki: string;
  dayOfWeek: DayOfWeek;
  kyureki: KyurekiDate;
  rokuyo: RokuyoInfo;
  kanshi: KanshiInfo;
  nijushiSekki: SekkiInfo;
  rekichu: RekichuInfo[];
  context: Record<string, ContextJudgment>;
  summary: string;
};

// ============================================================
// エラー
// ============================================================

/** エラーコード */
export type ErrorCode =
  | "INVALID_DATE"
  | "INVALID_PARAMETER"
  | "INVALID_API_KEY"
  | "RATE_LIMIT_EXCEEDED"
  | "INTERNAL_ERROR";

/** エラーレスポンス */
export type ErrorResponse = {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
};
