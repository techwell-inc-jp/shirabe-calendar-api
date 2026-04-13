/**
 * 暦計算統合サービス
 *
 * 全コアモジュールを統合し、APIレスポンス用のデータを生成する。
 */
import type {
  Category,
} from "./types.js";
import { toKyureki } from "./kyureki.js";
import { calcRokuyo } from "./rokuyo.js";
import { calcKanshi } from "./kanshi.js";
import { calcSekki } from "./sekki.js";
import { judgeRekichu } from "./rekichu.js";
import { generateContext, generateSummary } from "./context.js";

// ============================================================
// 和暦変換
// ============================================================

type WarekiEraEntry = {
  name: string;
  startYear: number;
  startMonth: number;
  startDay: number;
};

const WAREKI_ERAS: WarekiEraEntry[] = [
  { name: "令和", startYear: 2019, startMonth: 5, startDay: 1 },
  { name: "平成", startYear: 1989, startMonth: 1, startDay: 8 },
  { name: "昭和", startYear: 1926, startMonth: 12, startDay: 25 },
  { name: "大正", startYear: 1912, startMonth: 7, startDay: 30 },
  { name: "明治", startYear: 1868, startMonth: 1, startDay: 25 },
];

/**
 * 西暦日付を和暦文字列に変換する
 */
function toWareki(year: number, month: number, day: number): string {
  for (const era of WAREKI_ERAS) {
    const eraStart = new Date(era.startYear, era.startMonth - 1, era.startDay);
    const target = new Date(year, month - 1, day);
    if (target >= eraStart) {
      const eraYear = year - era.startYear + 1;
      const yearStr = eraYear === 1 ? "元" : String(eraYear);
      return `${era.name}${yearStr}年${month}月${day}日`;
    }
  }
  return `${year}年${month}月${day}日`;
}

// ============================================================
// 曜日
// ============================================================

const DAY_OF_WEEK_JA = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];
const DAY_OF_WEEK_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * 曜日を取得する
 */
function getDayOfWeek(year: number, month: number, day: number): { ja: string; en: string } {
  const d = new Date(year, month - 1, day);
  const idx = d.getDay();
  return { ja: DAY_OF_WEEK_JA[idx], en: DAY_OF_WEEK_EN[idx] };
}

// ============================================================
// APIレスポンス型（スネークケース）
// ============================================================

/** 単日レスポンス（PRD Section 1.3 EP1 準拠） */
export type CalendarApiResponse = {
  date: string;
  wareki: string;
  day_of_week: { ja: string; en: string };
  kyureki: {
    year: number;
    month: number;
    day: number;
    is_leap_month: boolean;
    month_name: string;
  };
  rokuyo: {
    name: string;
    reading: string;
    description: string;
    time_slots: {
      morning: string;
      noon: string;
      afternoon: string;
      evening: string;
    };
  };
  kanshi: {
    full: string;
    jikkan: string;
    junishi: string;
    junishi_animal: { ja: string; en: string };
  };
  nijushi_sekki: {
    name: string;
    reading: string;
    description: string;
    is_today: boolean;
  };
  rekichu: Array<{
    name: string;
    reading: string;
    description: string;
    type: string;
  }>;
  context: Record<string, { judgment: string; note: string; score: number }>;
  summary: string;
};

/** 範囲レスポンス（PRD Section 1.3 EP2 準拠） */
export type CalendarRangeApiResponse = {
  start: string;
  end: string;
  filters_applied: {
    rokuyo: string[] | null;
    rekichu: string[] | null;
    category: string | null;
    min_score: number | null;
  };
  count: number;
  dates: Array<{
    date: string;
    rokuyo: string;
    rekichu: string[];
    context: Record<string, { judgment: string; score: number; note: string }>;
  }>;
};

/** ベストデイレスポンス（PRD Section 1.3 EP3 準拠） */
export type BestDaysApiResponse = {
  purpose: string;
  period: { start: string; end: string };
  best_days: Array<{
    rank: number;
    date: string;
    day_of_week: string;
    rokuyo: string;
    rekichu: string[];
    judgment: string;
    score: number;
    note: string;
  }>;
};

// ============================================================
// 日付パース・バリデーション
// ============================================================

/**
 * YYYY-MM-DD文字列をパースする
 * @returns [year, month, day] or null if invalid
 */
export function parseDate(dateStr: string): [number, number, number] | null {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  // 実在する日付かチェック
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }

  return [year, month, day];
}

/**
 * 日付が対応範囲内かチェックする
 */
export function isDateInRange(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  const min = new Date(1873, 0, 1);
  const max = new Date(2100, 11, 31);
  return d >= min && d <= max;
}

/**
 * YYYY-MM-DD形式の文字列を生成する
 */
function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * 2つの日付の差分（日数）を求める
 */
function daysBetween(y1: number, m1: number, d1: number, y2: number, m2: number, d2: number): number {
  const date1 = new Date(y1, m1 - 1, d1);
  const date2 = new Date(y2, m2 - 1, d2);
  return Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================
// サービスメソッド
// ============================================================

/** 全カテゴリ */
const ALL_CATEGORIES: Category[] = [
  "wedding", "funeral", "moving", "construction",
  "business", "car_delivery", "marriage_registration", "travel",
];

/**
 * 指定日のカレンダー情報を取得する（EP1用）
 */
export function getCalendarInfo(
  year: number,
  month: number,
  day: number,
  categories?: Category[]
): CalendarApiResponse {
  const targetCategories = categories && categories.length > 0 ? categories : ALL_CATEGORIES;

  const kyureki = toKyureki(year, month, day);
  const rokuyo = calcRokuyo(kyureki);
  const kanshi = calcKanshi(year, month, day);
  const sekki = calcSekki(year, month, day);
  const rekichu = judgeRekichu(year, month, day, kyureki, kanshi);
  const context = generateContext(rokuyo, rekichu, targetCategories);
  const summary = generateSummary(rokuyo, rekichu, context);
  const dayOfWeek = getDayOfWeek(year, month, day);
  const wareki = toWareki(year, month, day);

  return {
    date: formatDate(year, month, day),
    wareki,
    day_of_week: dayOfWeek,
    kyureki: {
      year: kyureki.year,
      month: kyureki.month,
      day: kyureki.day,
      is_leap_month: kyureki.isLeapMonth,
      month_name: kyureki.monthName,
    },
    rokuyo: {
      name: rokuyo.name,
      reading: rokuyo.reading,
      description: rokuyo.description,
      time_slots: {
        morning: rokuyo.timeSlots.morning,
        noon: rokuyo.timeSlots.noon,
        afternoon: rokuyo.timeSlots.afternoon,
        evening: rokuyo.timeSlots.evening,
      },
    },
    kanshi: {
      full: kanshi.full,
      jikkan: kanshi.jikkan,
      junishi: kanshi.junishi,
      junishi_animal: kanshi.junishiAnimal,
    },
    nijushi_sekki: {
      name: sekki.name,
      reading: sekki.reading,
      description: sekki.description,
      is_today: sekki.isToday,
    },
    rekichu: rekichu.map((r) => ({
      name: r.name,
      reading: r.reading,
      description: r.description,
      type: r.type,
    })),
    context,
    summary,
  };
}

/** EP2用フィルター */
export type RangeFilters = {
  filterRokuyo?: string[];
  filterRekichu?: string[];
  category?: Category;
  minScore?: number;
};

/**
 * 日付範囲のカレンダー情報を取得する（EP2用）
 */
export function getCalendarRange(
  startYear: number,
  startMonth: number,
  startDay: number,
  endYear: number,
  endMonth: number,
  endDay: number,
  filters: RangeFilters = {}
): CalendarRangeApiResponse {
  const startStr = formatDate(startYear, startMonth, startDay);
  const endStr = formatDate(endYear, endMonth, endDay);
  const totalDays = daysBetween(startYear, startMonth, startDay, endYear, endMonth, endDay);

  const dates: CalendarRangeApiResponse["dates"] = [];

  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(startYear, startMonth - 1, startDay + i);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const dd = d.getDate();

    const kyureki = toKyureki(y, m, dd);
    const rokuyo = calcRokuyo(kyureki);
    const kanshi = calcKanshi(y, m, dd);
    const rekichuList = judgeRekichu(y, m, dd, kyureki, kanshi);

    // 六曜フィルター
    if (filters.filterRokuyo && filters.filterRokuyo.length > 0) {
      if (!filters.filterRokuyo.includes(rokuyo.name)) continue;
    }

    // 暦注フィルター
    if (filters.filterRekichu && filters.filterRekichu.length > 0) {
      const rekichuNames = rekichuList.map((r) => r.name);
      const hasMatch = filters.filterRekichu.some((f) => rekichuNames.includes(f as any));
      if (!hasMatch) continue;
    }

    // カテゴリ指定がある場合はそのカテゴリのcontextのみ
    const categories: Category[] = filters.category ? [filters.category] : ALL_CATEGORIES;
    const context = generateContext(rokuyo, rekichuList, categories);

    // スコアフィルター
    if (filters.minScore != null && filters.category) {
      const catContext = Object.values(context)[0];
      if (!catContext || catContext.score < filters.minScore) continue;
    }

    dates.push({
      date: formatDate(y, m, dd),
      rokuyo: rokuyo.name,
      rekichu: rekichuList.map((r) => r.name),
      context,
    });
  }

  return {
    start: startStr,
    end: endStr,
    filters_applied: {
      rokuyo: filters.filterRokuyo ?? null,
      rekichu: filters.filterRekichu ?? null,
      category: filters.category ?? null,
      min_score: filters.minScore ?? null,
    },
    count: dates.length,
    dates,
  };
}

/** EP3用オプション */
export type BestDaysOptions = {
  purpose: Category;
  startYear: number;
  startMonth: number;
  startDay: number;
  endYear: number;
  endMonth: number;
  endDay: number;
  limit?: number;
  excludeWeekdays?: number[];
};

/**
 * 指定用途に最適な日をランキングで返す（EP3用）
 */
export function getBestDays(options: BestDaysOptions): BestDaysApiResponse {
  const {
    purpose,
    startYear, startMonth, startDay,
    endYear, endMonth, endDay,
    limit = 5,
    excludeWeekdays = [],
  } = options;

  const totalDays = daysBetween(startYear, startMonth, startDay, endYear, endMonth, endDay);

  type DayEntry = {
    date: string;
    dayOfWeek: string;
    rokuyo: string;
    rekichu: string[];
    judgment: string;
    score: number;
    note: string;
  };

  const candidates: DayEntry[] = [];

  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(startYear, startMonth - 1, startDay + i);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const dd = d.getDate();
    const dow = d.getDay();

    // 除外曜日
    if (excludeWeekdays.includes(dow)) continue;

    const kyureki = toKyureki(y, m, dd);
    const rokuyo = calcRokuyo(kyureki);
    const kanshi = calcKanshi(y, m, dd);
    const rekichuList = judgeRekichu(y, m, dd, kyureki, kanshi);
    const context = generateContext(rokuyo, rekichuList, [purpose]);
    const dayOfWeek = getDayOfWeek(y, m, dd);

    const contextEntry = Object.values(context)[0];
    if (!contextEntry) continue;

    candidates.push({
      date: formatDate(y, m, dd),
      dayOfWeek: dayOfWeek.ja,
      rokuyo: rokuyo.name,
      rekichu: rekichuList.filter((r) => r.type === "吉").map((r) => r.name),
      judgment: contextEntry.judgment,
      score: contextEntry.score,
      note: contextEntry.note,
    });
  }

  // スコア降順でソート
  candidates.sort((a, b) => b.score - a.score);

  // 上位limit件
  const bestDays = candidates.slice(0, limit).map((entry, idx) => ({
    rank: idx + 1,
    ...entry,
    day_of_week: entry.dayOfWeek,
  }));

  // dayOfWeekプロパティを除去してday_of_weekに統一
  const formatted = bestDays.map(({ dayOfWeek, ...rest }) => rest);

  return {
    purpose,
    period: {
      start: formatDate(startYear, startMonth, startDay),
      end: formatDate(endYear, endMonth, endDay),
    },
    best_days: formatted,
  };
}
