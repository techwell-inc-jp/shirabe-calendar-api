/**
 * 暦注×用途（8カテゴリ）の吉凶マッピングデータ
 *
 * PRD Section 1.2 の判定ルールに基づく。
 *
 * 判定ルール:
 * - 天赦日はすべての凶を打ち消す
 * - 不成就日は吉日の効果を半減させる（判定を1段階下げる）
 * - 一粒万倍日 + 大安 = 大吉に昇格
 * - 三隣亡は建築カテゴリのみに影響（他カテゴリには影響しない）
 */
import type {
  Category,
  JudgmentValue,
  RokuyoType,
} from "../core/types.js";

// ============================================================
// 六曜の基本スコア（カテゴリ別）
// ============================================================

/**
 * 六曜ごとの基本スコア（カテゴリ別）
 * スコアは1〜10のベース値
 */
export const ROKUYO_BASE_SCORE: Record<RokuyoType, Record<Category, number>> = {
  大安: {
    wedding: 8,
    funeral: 3,
    moving: 7,
    construction: 7,
    business: 7,
    car_delivery: 7,
    marriage_registration: 8,
    travel: 7,
  },
  友引: {
    wedding: 6,
    funeral: 1, // 葬儀は友引を避ける
    moving: 5,
    construction: 5,
    business: 5,
    car_delivery: 5,
    marriage_registration: 6,
    travel: 5,
  },
  先勝: {
    wedding: 5,
    funeral: 5,
    moving: 5,
    construction: 5,
    business: 6,
    car_delivery: 5,
    marriage_registration: 5,
    travel: 5,
  },
  先負: {
    wedding: 4,
    funeral: 5,
    moving: 4,
    construction: 4,
    business: 4,
    car_delivery: 4,
    marriage_registration: 4,
    travel: 4,
  },
  赤口: {
    wedding: 3,
    funeral: 4,
    moving: 3,
    construction: 3,
    business: 3,
    car_delivery: 3,
    marriage_registration: 3,
    travel: 3,
  },
  仏滅: {
    wedding: 2,
    funeral: 5, // 葬儀は仏滅でも問題なし
    moving: 2,
    construction: 2,
    business: 2,
    car_delivery: 2,
    marriage_registration: 2,
    travel: 2,
  },
};

// ============================================================
// 暦注のスコア修正値（カテゴリ別）
// ============================================================

/**
 * 吉日暦注によるスコア加算値
 * カテゴリ依存の加算値を持つ
 */
export const KICHI_REKICHU_BONUS: Record<string, Partial<Record<Category, number>> & { default: number }> = {
  一粒万倍日: {
    default: 2,
    wedding: 2,
    business: 3,
    marriage_registration: 2,
  },
  天赦日: {
    default: 3,
    wedding: 3,
    business: 3,
  },
  大明日: {
    default: 1,
    construction: 2,
    moving: 2,
  },
  母倉日: {
    default: 1,
    wedding: 2,
    marriage_registration: 2,
  },
  天恩日: {
    default: 1,
    wedding: 2,
    business: 2,
  },
  寅の日: {
    default: 1,
    travel: 2,
    business: 1,
  },
  巳の日: {
    default: 1,
    business: 2,
  },
  己巳の日: {
    default: 2,
    business: 3,
  },
  甲子の日: {
    default: 1,
    business: 2,
  },
};

/**
 * 凶日暦注によるスコア減算値
 */
export const KYO_REKICHU_PENALTY: Record<string, Partial<Record<Category, number>> & { default: number }> = {
  不成就日: {
    default: -2,
  },
  三隣亡: {
    default: 0, // 建築以外は影響なし
    construction: -4,
  },
  受死日: {
    default: -3,
  },
  十死日: {
    default: -2,
  },
};

// ============================================================
// 六曜のコメントテンプレート
// ============================================================

/** 六曜×カテゴリのコメントテンプレート */
export const ROKUYO_NOTES: Record<RokuyoType, Partial<Record<Category, string>>> = {
  大安: {
    wedding: "大安は終日吉で、結婚式に最適な日",
    funeral: "大安は慶事の日のため、葬儀は避けるのが一般的",
    moving: "大安は万事に良い日。引っ越しに適する",
    construction: "大安は着工・上棟に良い日",
    business: "大安は開業・契約に最適な日",
    car_delivery: "大安は納車に最適な日",
    marriage_registration: "大安は入籍に最適な日",
    travel: "大安は旅行出発に良い日",
  },
  友引: {
    wedding: "友引は慶事に良い日",
    funeral: "友引の葬儀は「友を引く」として避けるべき",
    moving: "友引は引っ越しに問題なし",
    construction: "友引は建築に問題なし",
    business: "友引は契約・開業に問題なし",
    car_delivery: "友引は納車に問題なし",
    marriage_registration: "友引は入籍に良い日",
    travel: "友引は旅行出発に問題なし",
  },
  先勝: {
    wedding: "先勝は午前中が吉。午前の式が望ましい",
    funeral: "先勝は葬儀に特に問題なし",
    construction: "先勝は午前に着工するのが良い",
    business: "先勝は午前中に契約・開業するのが吉",
  },
  先負: {
    wedding: "先負は午後が吉。午後の式なら問題なし",
    funeral: "先負は葬儀に特に問題なし",
    business: "先負は午後に契約するのが良い",
  },
  赤口: {
    wedding: "赤口は正午のみ吉。結婚式は避けた方が無難",
    funeral: "赤口は葬儀に大きな問題はない",
    construction: "赤口は建築にはやや不向き",
    business: "赤口は正午のみ吉。契約は昼頃に",
  },
  仏滅: {
    wedding: "仏滅は結婚式を避けるのが一般的",
    funeral: "仏滅は葬儀には問題なし",
    moving: "仏滅の引っ越しは避けた方が無難",
    construction: "仏滅は着工・上棟を避けるのが一般的",
    business: "仏滅は開業・契約を避けた方が無難",
    car_delivery: "仏滅の納車は避ける人が多い",
    marriage_registration: "仏滅の入籍は避けるのが一般的",
    travel: "仏滅の旅行出発はやや不向き",
  },
};

// ============================================================
// スコア → 判定値 変換
// ============================================================

/** スコアから判定値への変換テーブル */
export const SCORE_TO_JUDGMENT: ReadonlyArray<{ min: number; judgment: JudgmentValue }> = [
  { min: 9, judgment: "大吉" },
  { min: 7, judgment: "吉" },
  { min: 5, judgment: "小吉" },
  { min: 4, judgment: "問題なし" },
  { min: 3, judgment: "注意" },
  { min: 2, judgment: "凶" },
  { min: 0, judgment: "大凶" },
];

/**
 * スコアから判定値を取得する
 */
export function scoreToJudgment(score: number): JudgmentValue {
  const clamped = Math.max(1, Math.min(10, score));
  for (const entry of SCORE_TO_JUDGMENT) {
    if (clamped >= entry.min) {
      return entry.judgment;
    }
  }
  return "大凶";
}

// ============================================================
// カテゴリ日本語名
// ============================================================

/** APIレスポンス用のカテゴリ日本語キー */
export const CATEGORY_DISPLAY_NAME: Record<Category, string> = {
  wedding: "結婚",
  funeral: "葬儀",
  moving: "引っ越し",
  construction: "建築着工",
  business: "開業",
  car_delivery: "納車",
  marriage_registration: "入籍",
  travel: "旅行",
};
