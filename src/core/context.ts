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
 * カテゴリに実際に影響する吉日暦注を抽出する
 */
function getRelevantKichiRekichu(
  rekichu: RekichuInfo[],
  category: Category
): RekichuInfo[] {
  return rekichu.filter((r) => {
    if (r.type !== "吉") return false;
    const bonusMap = KICHI_REKICHU_BONUS[r.name];
    if (!bonusMap) return false;
    const bonus =
      (bonusMap as Record<string, number>)[category] ?? bonusMap.default;
    return bonus > 0;
  });
}

/**
 * カテゴリに実際に影響する凶日暦注を抽出する（天赦日考慮済み）
 */
function getRelevantKyoRekichu(
  rekichu: RekichuInfo[],
  category: Category,
  hasTenshanichi: boolean
): RekichuInfo[] {
  if (hasTenshanichi) return [];
  return rekichu.filter((r) => {
    if (r.type !== "凶") return false;
    if (r.name === "三隣亡" && category !== "construction") return false;
    return true;
  });
}

/**
 * AIがユーザーにそのまま伝えられる自然なnote文を生成する
 *
 * 吉凶混在時は総合判断を先に述べ、詳細を補足する構成にする。
 * 六曜の吉凶も考慮し、六曜凶 + 暦注吉 のような組み合わせでも
 * 矛盾のない自然な文章を生成する。
 */
function buildNote(
  rokuyo: RokuyoInfo,
  rekichu: RekichuInfo[],
  category: Category,
  judgment: JudgmentValue,
  hasTenshanichi: boolean,
  hasFujojubi: boolean,
  hasSpecialCombo: boolean
): string {
  const displayName = CATEGORY_DISPLAY_NAME[category];
  const rokuyoBase = ROKUYO_NOTES[rokuyo.name][category] || `${rokuyo.name}の日`;
  const relevantKichi = getRelevantKichiRekichu(rekichu, category);
  const relevantKyo = getRelevantKyoRekichu(rekichu, category, hasTenshanichi);
  const rokuyoBaseScore = ROKUYO_BASE_SCORE[rokuyo.name][category];
  const isRokuyoNegative = rokuyoBaseScore <= 4;

  // 大安 + 一粒万倍日 の特別コンボ
  if (hasSpecialCombo) {
    return `大安と一粒万倍日が重なる大変縁起の良い日です。${displayName}には最適な日取りです`;
  }

  // 天赦日（すべての凶を打ち消す）
  if (hasTenshanichi) {
    const otherKichi = relevantKichi.filter((r) => r.name !== "天赦日");
    if (otherKichi.length > 0) {
      return `天赦日に加え${otherKichi.map((r) => r.name).join("・")}も重なる大変良い日です。凶の影響もすべて打ち消されるため、${displayName}にも安心の日取りです`;
    }
    return `天赦日のため万事に吉で、凶の影響もすべて打ち消されます。${displayName}にも良い日取りです`;
  }

  // 暦注の吉凶混在（吉暦注 + 凶暦注の両方がある場合）
  if (relevantKichi.length > 0 && relevantKyo.length > 0) {
    const kichiNames = relevantKichi.map((r) => r.name).join("・");
    const kyoNames = relevantKyo.map((r) => r.name).join("・");
    return `${rokuyo.name}で${kichiNames}と重なる日ですが、${kyoNames}の影響もあるため${displayName}は慎重に日程をご検討ください`;
  }

  // 六曜凶 + 吉暦注（凶暦注なし）: 六曜の懸念を先に述べ、暦注の吉で補足
  if (relevantKichi.length > 0 && isRokuyoNegative) {
    const kichiNames = relevantKichi.map((r) => r.name).join("・");
    if (hasFujojubi) {
      return `${rokuyoBase}です。${kichiNames}と重なりますが、不成就日のため吉の効果が半減します。${displayName}は慎重にご判断ください`;
    }
    // 判定が小吉以上: 暦注の吉が六曜の凶を十分に補っている
    if (judgment === "大吉" || judgment === "吉" || judgment === "小吉") {
      return `${rokuyo.name}ではありますが、${kichiNames}と重なるため${displayName}には支障のない日取りです`;
    }
    // 判定が問題なし〜注意: バランスを取った表現
    return `${rokuyoBase}ですが、${kichiNames}と重なるため気にされない方には問題のない日取りです`;
  }

  // 六曜吉〜中立 + 吉暦注（凶暦注なし）
  if (relevantKichi.length > 0) {
    const kichiNames = relevantKichi.map((r) => r.name).join("・");
    if (hasFujojubi) {
      return `${rokuyoBase}です。${kichiNames}と重なりますが、不成就日のため吉の効果が半減します。${displayName}は慎重にご判断ください`;
    }
    return `${rokuyoBase}です。さらに${kichiNames}も重なり、${displayName}に良い日取りです`;
  }

  // 凶暦注のみ
  if (relevantKyo.length > 0) {
    const kyoNames = relevantKyo.map((r) => r.name).join("・");
    return `${rokuyoBase}ですが、${kyoNames}と重なるため${displayName}は別の日程のご検討をおすすめします`;
  }

  // 暦注なし（不成就日のみの場合）
  if (hasFujojubi) {
    return `${rokuyoBase}ですが、不成就日のため新しいことを始めるには不向きな日です`;
  }

  // 暦注なし
  return `${rokuyoBase}です`;
}

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
    const hasSpecialCombo = hasIchiryumanbaibi && isTaian && category !== "funeral";

    // 一粒万倍日 + 大安 = 大吉に昇格
    if (hasSpecialCombo) {
      judgment = "大吉";
      score = Math.max(score, 10);
    }

    // 天赦日はすべての凶を打ち消す
    if (hasTenshanichi) {
      if (judgment === "凶" || judgment === "大凶" || judgment === "注意") {
        judgment = "小吉";
        score = Math.max(score, 5);
      }
    }

    // 不成就日は吉日の効果を半減させる（判定を1段階下げる）
    if (hasFujojubi && !hasTenshanichi) {
      judgment = downgradeJudgment(judgment);
      score = Math.max(1, score - 1);
    }

    // 最終スコアクランプ
    score = Math.max(1, Math.min(10, score));

    // Step 7: 自然な文章のnoteを生成
    const note = buildNote(
      rokuyo,
      rekichu,
      category,
      judgment,
      hasTenshanichi,
      hasFujojubi,
      hasSpecialCombo
    );

    result[displayName] = {
      judgment,
      note,
      score,
    };
  }

  return result;
}

/**
 * 暦情報のサマリー文を生成する
 *
 * AIがユーザーにそのまま伝えられる自然な日本語を生成する。
 * 吉凶混在時は総合的な判断を先に述べてから詳細を補足する。
 *
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
  const kichiRekichu = rekichu.filter((r) => r.type === "吉");
  const kyoRekichu = rekichu.filter((r) => r.type === "凶");

  // 天赦日がある場合は特別扱い
  if (rekichu.some((r) => r.name === "天赦日")) {
    parts.push("天赦日（年に5〜6回の最上吉日）です");
    const otherKichi = kichiRekichu.filter((r) => r.name !== "天赦日");
    if (otherKichi.length > 0) {
      parts.push(
        `${otherKichi.map((r) => r.name).join("・")}も重なる特別な日です`
      );
    }
    parts.push("万事に吉で、新しいことを始めるのに最適です");
  } else {
    // 六曜の基本情報
    parts.push(`${rokuyo.name}（${rokuyo.reading}）の日です`);

    // 吉凶混在: 一文でまとめて自然な流れにする
    if (kichiRekichu.length > 0 && kyoRekichu.length > 0) {
      const kichiNames = kichiRekichu.map((r) => r.name).join("・");
      const kyoNames = kyoRekichu.map((r) => r.name).join("・");
      parts.push(
        `${kichiNames}と重なり縁起の良い面もありますが、${kyoNames}の影響があるため用途によっては慎重なご判断をおすすめします`
      );
    } else if (kichiRekichu.length > 0) {
      const names = kichiRekichu.map((r) => r.name).join("・");
      parts.push(`${names}と重なり、縁起の良い日です`);
    } else if (kyoRekichu.length > 0) {
      const names = kyoRekichu.map((r) => r.name).join("・");
      parts.push(
        `${names}と重なるため、慶事の日取りは慎重にご検討ください`
      );
    }
  }

  // 最も良い判定のカテゴリを紹介
  const entries = Object.entries(context);
  const best = entries.reduce<[string, ContextJudgment] | null>(
    (max, entry) => {
      if (!max || entry[1].score > max[1].score) return entry;
      return max;
    },
    null
  );

  if (best && best[1].score >= 8) {
    parts.push(`特に${best[0]}に良い日です`);
  }

  return parts.join("。") + "。";
}
