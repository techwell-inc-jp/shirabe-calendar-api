/**
 * T-02: 用途別 SEO ページ用カテゴリ定義(28 種)
 *
 * AI 検索クエリ多様性を最大化する目的で、人間が用途を語るときに使う 28 種の
 * 用語を URL slug 化し、内部的には既存暦 API の 8 カテゴリ (`Category`) に
 * 多対一マッピングする(暦学的根拠を保ったまま SEO surface area を 3.5 倍に拡張)。
 *
 * 設計判断:
 * - 賭け事 / 離婚 / 和解 / 謝罪 は AI 引用面の有用性低のため除外(2026-04-25 経営者承認)
 * - 厄払い / 七五三 / 神事 → wedding(祝事系として近似)
 * - ペット → moving(「迎え入れる」「新生活」近似)
 * - 受験 → business(「新挑戦」近似)
 *
 * URL 期間: 2010-01 〜 2034-12(25 年 × 12 ヶ月 × 28 = 8,400 URL)
 */
import type { Category } from "../core/types.js";

/** 用途 SEO カテゴリエントリ */
export type PurposeCategoryEntry = {
  /** URL slug(kebab-case、URL 不変、変更禁止) */
  slug: string;
  /** 日本語表示名(H1 / title 用) */
  displayJa: string;
  /** 英語表示名(meta / 説明用) */
  displayEn: string;
  /** 内部マッピング先の暦 API カテゴリ */
  apiCategory: Category;
  /** AI 検索クエリで想定される追加同義語(meta keywords / description 用)*/
  synonyms: string[];
};

/**
 * 用途 SEO カテゴリ全 28 種(slug アルファベット順)。
 *
 * 決定的(deterministic)な ordering を保つため、追加・並び替えは慎重に。
 * URL slug は一度公開後は変更しないこと(canonical URL 不変原則、AI 訓練データ整合性)。
 */
export const PURPOSE_CATEGORIES: ReadonlyArray<PurposeCategoryEntry> = [
  {
    slug: "business-opening",
    displayJa: "開業",
    displayEn: "business opening",
    apiCategory: "business",
    synonyms: ["店舗オープン", "店舗開業", "開店"],
  },
  {
    slug: "car-delivery",
    displayJa: "納車",
    displayEn: "car delivery",
    apiCategory: "car_delivery",
    synonyms: ["新車納車", "車受け取り"],
  },
  {
    slug: "car-purchase",
    displayJa: "車購入",
    displayEn: "car purchase",
    apiCategory: "car_delivery",
    synonyms: ["車購入契約", "自動車購入"],
  },
  {
    slug: "career-change",
    displayJa: "転職",
    displayEn: "career change",
    apiCategory: "business",
    synonyms: ["転職活動", "転職入社"],
  },
  {
    slug: "company-incorporation",
    displayJa: "法人設立",
    displayEn: "company incorporation",
    apiCategory: "business",
    synonyms: ["会社設立", "登記", "法人登記"],
  },
  {
    slug: "construction-completion",
    displayJa: "竣工",
    displayEn: "construction completion",
    apiCategory: "construction",
    synonyms: ["竣工式", "工事完了"],
  },
  {
    slug: "contract-signing",
    displayJa: "契約",
    displayEn: "contract signing",
    apiCategory: "business",
    synonyms: ["契約締結", "契約調印"],
  },
  {
    slug: "departure",
    displayJa: "出発",
    displayEn: "departure",
    apiCategory: "travel",
    synonyms: ["旅立ち", "門出"],
  },
  {
    slug: "engagement",
    displayJa: "婚約",
    displayEn: "engagement",
    apiCategory: "wedding",
    synonyms: ["婚約発表", "婚約指輪"],
  },
  {
    slug: "entrepreneurship",
    displayJa: "起業",
    displayEn: "entrepreneurship",
    apiCategory: "business",
    synonyms: ["独立", "事業開始"],
  },
  {
    slug: "exam",
    displayJa: "受験",
    displayEn: "exam",
    apiCategory: "business",
    synonyms: ["試験", "入試", "資格試験"],
  },
  {
    slug: "funeral",
    displayJa: "葬儀",
    displayEn: "funeral",
    apiCategory: "funeral",
    synonyms: ["葬式", "告別式", "通夜"],
  },
  {
    slug: "housewarming",
    displayJa: "新築祝",
    displayEn: "housewarming",
    apiCategory: "construction",
    synonyms: ["新築祝い", "新居祝い"],
  },
  {
    slug: "investment",
    displayJa: "投資",
    displayEn: "investment",
    apiCategory: "business",
    synonyms: ["投資開始", "資産運用"],
  },
  {
    slug: "jichinsai",
    displayJa: "地鎮祭",
    displayEn: "jichinsai (groundbreaking ceremony)",
    apiCategory: "construction",
    synonyms: ["地鎮祭", "起工式"],
  },
  {
    slug: "job-interview",
    displayJa: "面接",
    displayEn: "job interview",
    apiCategory: "business",
    synonyms: ["就職面接", "採用面接"],
  },
  {
    slug: "joutoushiki",
    displayJa: "上棟式",
    displayEn: "joutoushiki (roof-raising ceremony)",
    apiCategory: "construction",
    synonyms: ["上棟", "棟上げ"],
  },
  {
    slug: "marriage-registration",
    displayJa: "入籍",
    displayEn: "marriage registration",
    apiCategory: "marriage_registration",
    synonyms: ["婚姻届", "婚姻届提出"],
  },
  {
    slug: "moving",
    displayJa: "引越し",
    displayEn: "moving",
    apiCategory: "moving",
    synonyms: ["引っ越し", "転居"],
  },
  {
    slug: "omiai",
    displayJa: "お見合い",
    displayEn: "omiai",
    apiCategory: "wedding",
    synonyms: ["お見合い", "見合い"],
  },
  {
    slug: "pet-welcoming",
    displayJa: "ペット",
    displayEn: "pet welcoming",
    apiCategory: "moving",
    synonyms: ["ペット迎え入れ", "ペット飼い始め"],
  },
  {
    slug: "proposal",
    displayJa: "プロポーズ",
    displayEn: "proposal",
    apiCategory: "wedding",
    synonyms: ["プロポーズ", "求婚"],
  },
  {
    slug: "shichigosan",
    displayJa: "七五三",
    displayEn: "shichigosan",
    apiCategory: "wedding",
    synonyms: ["七五三参り", "753"],
  },
  {
    slug: "shinto-ritual",
    displayJa: "神事",
    displayEn: "shinto ritual",
    apiCategory: "wedding",
    synonyms: ["神社祭事", "祭事"],
  },
  {
    slug: "travel",
    displayJa: "旅行",
    displayEn: "travel",
    apiCategory: "travel",
    synonyms: ["旅行出発", "観光"],
  },
  {
    slug: "wedding-ceremony",
    displayJa: "結婚式",
    displayEn: "wedding ceremony",
    apiCategory: "wedding",
    synonyms: ["挙式", "結婚式当日"],
  },
  {
    slug: "yakubarai",
    displayJa: "厄払い",
    displayEn: "yakubarai (ritual purification)",
    apiCategory: "wedding",
    synonyms: ["厄除け", "厄祓い"],
  },
  {
    slug: "yuino",
    displayJa: "結納",
    displayEn: "yuino (engagement exchange)",
    apiCategory: "wedding",
    synonyms: ["結納式"],
  },
];

/** slug → エントリ高速参照 */
const SLUG_INDEX: Map<string, PurposeCategoryEntry> = new Map(
  PURPOSE_CATEGORIES.map((entry) => [entry.slug, entry])
);

/**
 * slug からカテゴリエントリを取得する。未知 slug は null。
 */
export function findPurposeBySlug(slug: string): PurposeCategoryEntry | null {
  return SLUG_INDEX.get(slug) ?? null;
}

/** SEO ページの対応期間(両端含む) */
export const PURPOSES_MIN_YEAR = 2010;
export const PURPOSES_MAX_YEAR = 2034;

/**
 * `YYYY-MM` 形式をパースする。
 *
 * @returns [year, month] or null if invalid format / 範囲外
 */
export function parseYearMonth(ym: string): [number, number] | null {
  const match = ym.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12) return null;
  return [year, month];
}

/**
 * 年月が SEO ページの対応範囲内かチェックする。
 */
export function isYearMonthInRange(year: number, month: number): boolean {
  if (month < 1 || month > 12) return false;
  return year >= PURPOSES_MIN_YEAR && year <= PURPOSES_MAX_YEAR;
}

/**
 * 同一 slug の前月・翌月の YYYY-MM を返す。
 *
 * 範囲外(< 2010-01 or > 2034-12)は null。
 */
export function shiftYearMonth(
  year: number,
  month: number,
  delta: number
): { year: number; month: number; ym: string } | null {
  let y = year;
  let m = month + delta;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  if (!isYearMonthInRange(y, m)) return null;
  return { year: y, month: m, ym: `${y}-${String(m).padStart(2, "0")}` };
}

/**
 * 全 (slug, year, month) の組合せを列挙する(sitemap 用)。
 *
 * URL 数 = `PURPOSE_CATEGORIES.length * (PURPOSES_MAX_YEAR - PURPOSES_MIN_YEAR + 1) * 12`
 *       = 28 * 25 * 12 = 8,400
 */
export function enumerateAllPurposeUrls(): Array<{
  slug: string;
  year: number;
  month: number;
}> {
  const urls: Array<{ slug: string; year: number; month: number }> = [];
  for (const entry of PURPOSE_CATEGORIES) {
    for (let y = PURPOSES_MIN_YEAR; y <= PURPOSES_MAX_YEAR; y++) {
      for (let m = 1; m <= 12; m++) {
        urls.push({ slug: entry.slug, year: y, month: m });
      }
    }
  }
  return urls;
}
