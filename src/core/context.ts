/**
 * 用途別吉凶コンテキスト生成
 *
 * 六曜・暦注を総合して、用途別の吉凶判定を生成する。
 *
 * 判定ルール（PRD Section 1.2.2）:
 * - 天赦日はすべての凶を打ち消す
 * - 不成就日は吉日の効果を半減させる（判定を1段階下げる）
 * - 一粒万倍日 + 大安 = 大吉に昇格
 * - 三隣亡は建築カテゴリのみに影響（他カテゴリには影響しない）
 */
import type {
  Category,
  ContextJudgment,
  RokuyoInfo,
  RekichuInfo,
  JudgmentValue,
} from "./types.js";
import {
  ROKUYO_BASE_SCORE,
  KICHI_REKICHU_BONUS,
  KYO_REKICHU_PENALTY,
  ROKUYO_NOTES,
  CATEGORY_DISPLAY_NAME,
  scoreToJudgment,
} from "../data/context-map.js";

/**
 * 判定値を1段階下げる（不成就日の効果）
 */
function downgradeJudgment(judgment: JudgmentValue): JudgmentValue {
  const order: JudgmentValue[] = ["大吉", "吉", "小吉", "問題なし", "注意", "凶", "大凶"];
  const idx = order.indexOf(judgment);
  if (idx < 0 || idx >= order.length - 1) return judgment;
  return order[idx + 1];
}

/**
 * 用途別の吉凶判定を生成する
 * @param rokuyo 六曜情報
 * @param rekichu 暦注リスト
 * @param categories 判定対象のカテゴリリスト
 * @returns カテゴリ名（日本語）をキーとした判定結果マップ
 */
export function generateContext(
  rokuyo: RokuyoInfo,
  rekichu: RekichuInfo[],
  categories: Category[]
): Record<string, ContextJudgment> {
  const result: Record<string, ContextJudgment> = {};

  const rekichuNames = rekichu.map((r) => r.name);
  const hasTenshanichi = rekichuNames.includes("天赦日");
  const hasFujojubi = rekichuNames.includes("不成就日");
  const hasIchiryumanbaibi = rekichuNames.includes("一粒万倍日");
  const isTaian = rokuyo.name === "大安";

  for (const category of categories) {
    const displayName = CATEGORY_DISPLAY_NAME[category];

    // Step 1: 六曜のベーススコア
    let score = ROKUYO_BASE_SCORE[rokuyo.name][category];
    const notes: string[] = [];

    // 六曜のコメント
    const rokuyoNote = ROKUYO_NOTES[rokuyo.name][category];
    if (rokuyoNote) {
      notes.push(rokuyoNote);
    }

    // Step 2: 吉日暦注のボーナス加算
    for (const r of rekichu) {
      if (r.type === "吉") {
        const bonusMap = KICHI_REKICHU_BONUS[r.name];
        if (bonusMap) {
          const bonus = (bonusMap as Record<string, number>)[category] ?? bonusMap.default;
          score += bonus;
        }
      }
    }

    // Step 3: 凶日暦注のペナルティ減算
    // ただし天赦日がある場合はすべての凶を打ち消す
    if (!hasTenshanichi) {
      for (const r of rekichu) {
        if (r.type === "凶") {
          const penaltyMap = KYO_REKICHU_PENALTY[r.name];
          if (penaltyMap) {
            const penalty = (penaltyMap as Record<string, number>)[category] ?? penaltyMap.default;
            score += penalty; // penalty is negative
          }
        }
      }
    }

    // Step 4: スコアを1〜10にクランプ
    score = Math.max(1, Math.min(10, score));

    // Step 5: 判定値を算出
    let judgment = scoreToJudgment(score);

    // Step 6: 特殊ルール適用

    // 一粒万倍日 + 大安 = 大吉に昇格
    if (hasIchiryumanbaibi && isTaian && category !== "funeral") {
      judgment = "大吉";
      score = Math.max(score, 10);
      notes.push("大安と一粒万倍日が重なる最良の日");
    }

    // 天赦日はすべての凶を打ち消す
    if (hasTenshanichi) {
      if (judgment === "凶" || judgment === "大凶" || judgment === "注意") {
        judgment = "小吉";
        score = Math.max(score, 5);
      }
      notes.push("天赦日により凶の影響が打ち消される");
    }

    // 不成就日は吉日の効果を半減させる（判定を1段階下げる）
    if (hasFujojubi && !hasTenshanichi) {
      judgment = downgradeJudgment(judgment);
      score = Math.max(1, score - 1);
      notes.push("不成就日のため吉の効果が半減");
    }

    // 暦注のコメント追加
    for (const r of rekichu) {
      if (r.type === "吉") {
        const bonusMap = KICHI_REKICHU_BONUS[r.name];
        const bonus = bonusMap
          ? ((bonusMap as Record<string, number>)[category] ?? bonusMap.default)
          : 0;
        if (bonus > 0) {
          notes.push(`${r.name}で${r.description.split("。")[0]}`);
        }
      }
      if (r.type === "凶" && !hasTenshanichi) {
        if (r.name === "三隣亡" && category !== "construction") {
          continue; // 三隣亡は建築以外スキップ
        }
        notes.push(r.description.split("。")[0]);
      }
    }

    // 最終スコアクランプ
    score = Math.max(1, Math.min(10, score));

    result[displayName] = {
      judgment,
      note: notes.slice(0, 3).join("。") || `${rokuyo.name}の日`,
      score,
    };
  }

  return result;
}

/**
 * 暦情報のサマリー文を生成する
 * @param rokuyo 六曜情報
 * @param rekichu 暦注リスト
 * @param context コンテキスト判定結果
 * @returns 自然言語のサマリー文
 */
export function generateSummary(
  rokuyo: RokuyoInfo,
  rekichu: RekichuInfo[],
  context: Record<string, ContextJudgment>
): string {
  const parts: string[] = [];

  // 六曜
  parts.push(`${rokuyo.name}（${rokuyo.reading}）の日です`);

  // 吉日暦注
  const kichiRekichu = rekichu.filter((r) => r.type === "吉");
  if (kichiRekichu.length > 0) {
    const names = kichiRekichu.map((r) => r.name).join("・");
    parts.push(`${names}と重なり、縁起の良い日です`);
  }

  // 凶日暦注
  const kyoRekichu = rekichu.filter((r) => r.type === "凶");
  if (kyoRekichu.length > 0) {
    const names = kyoRekichu.map((r) => r.name).join("・");
    parts.push(`ただし${names}のため注意が必要です`);
  }

  // 天赦日がある場合
  if (rekichu.some((r) => r.name === "天赦日")) {
    parts.length = 0; // リセット
    parts.push("天赦日（年に5〜6回の最上吉日）です");
    const otherKichi = kichiRekichu.filter((r) => r.name !== "天赦日");
    if (otherKichi.length > 0) {
      parts.push(`${otherKichi.map((r) => r.name).join("・")}も重なる特別な日です`);
    }
    parts.push("万事に吉で、新しいことを始めるのに最適です");
  }

  // 最も良い判定のカテゴリを紹介
  const entries = Object.entries(context);
  const best = entries.reduce<[string, ContextJudgment] | null>((max, entry) => {
    if (!max || entry[1].score > max[1].score) return entry;
    return max;
  }, null);

  if (best && best[1].score >= 8) {
    parts.push(`特に${best[0]}に良い日です`);
  }

  return parts.join("。") + "。";
}
