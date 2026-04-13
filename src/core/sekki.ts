/**
 * 二十四節気計算
 *
 * 太陽黄経から指定日が属する二十四節気を判定する。
 */
import type { SekkiInfo, SekkiName } from "./types.js";
import { SEKKI_DEFINITIONS } from "../data/sekki-data.js";
import { gregorianToJD, solarLongitude } from "./kyureki.js";

/**
 * 太陽黄経から現在の二十四節気を判定する
 * @param longitude 太陽黄経（0〜360度）
 * @returns 該当する節気の定義
 */
function findSekkiByLongitude(longitude: number) {
  // 黄経を正規化
  const lon = ((longitude % 360) + 360) % 360;

  // 各節気は15度区間を持つ
  // 該当する節気を見つける（黄経が節気のlongitude以上、次の節気のlongitude未満）
  for (let i = 0; i < SEKKI_DEFINITIONS.length; i++) {
    const current = SEKKI_DEFINITIONS[i];
    const next = SEKKI_DEFINITIONS[(i + 1) % SEKKI_DEFINITIONS.length];

    let start = current.longitude;
    let end = next.longitude;

    // 360度→0度の境界を跨ぐ場合
    if (end <= start) {
      if (lon >= start || lon < end) {
        return current;
      }
    } else {
      if (lon >= start && lon < end) {
        return current;
      }
    }
  }

  // fallback（到達しないはず）
  return SEKKI_DEFINITIONS[0];
}

/**
 * 指定日が節気の当日（開始日）かどうか判定する
 * @param year 西暦年
 * @param month 月
 * @param day 日
 * @returns 節気の当日であれば該当する節気名、そうでなければnull
 */
function isSekkiDay(
  year: number,
  month: number,
  day: number
): SekkiName | null {
  const jd = gregorianToJD(year, month, day);
  const todayLon = solarLongitude(jd);
  const yesterdayLon = solarLongitude(jd - 1);

  // 今日と昨日の間で15度境界を跨いだか
  for (const def of SEKKI_DEFINITIONS) {
    const target = def.longitude;
    // 境界を跨いだか判定
    let crossed = false;

    if (target === 0) {
      // 0度境界（345度台→0度台）
      crossed =
        (yesterdayLon > 350 && todayLon < 10) ||
        (yesterdayLon <= target && todayLon > target && todayLon - yesterdayLon < 15);
    } else {
      // 通常の境界
      const yNorm = yesterdayLon <= target + 15 ? yesterdayLon : yesterdayLon - 360;
      const tNorm = todayLon <= target + 15 ? todayLon : todayLon - 360;
      crossed = yNorm < target && tNorm >= target;
    }

    if (crossed) {
      return def.name;
    }
  }

  return null;
}

/**
 * 指定日の二十四節気情報を取得する
 * @param year 西暦年
 * @param month 月（1-12）
 * @param day 日（1-31）
 * @returns 二十四節気情報
 */
export function calcSekki(
  year: number,
  month: number,
  day: number
): SekkiInfo {
  const jd = gregorianToJD(year, month, day);
  const longitude = solarLongitude(jd);
  const def = findSekkiByLongitude(longitude);

  const sekkiToday = isSekkiDay(year, month, day);

  return {
    name: def.name,
    reading: def.reading,
    description: def.description,
    isToday: sekkiToday === def.name,
  };
}

/**
 * 指定日が属する季節（節気ベース）を判定する
 * 天赦日等の判定で使用
 * @param year 西暦年
 * @param month 月
 * @param day 日
 * @returns 季節を表す節気名（立春/立夏/立秋/立冬のいずれか）
 */
export function getSeason(
  year: number,
  month: number,
  day: number
): "立春" | "立夏" | "立秋" | "立冬" {
  const jd = gregorianToJD(year, month, day);
  const lon = solarLongitude(jd);

  // 立春(315°) 〜 立夏(45°) = 春
  // 立夏(45°) 〜 立秋(135°) = 夏
  // 立秋(135°) 〜 立冬(225°) = 秋
  // 立冬(225°) 〜 立春(315°) = 冬
  if (lon >= 315 || lon < 45) return "立春";
  if (lon >= 45 && lon < 135) return "立夏";
  if (lon >= 135 && lon < 225) return "立秋";
  return "立冬";
}

/**
 * 指定日が属する節気期間の開始節気名を取得する
 * 一粒万倍日の判定で使用
 * @param year 西暦年
 * @param month 月
 * @param day 日
 * @returns 節気名
 */
export function getCurrentSekkiPeriod(
  year: number,
  month: number,
  day: number
): SekkiName {
  const jd = gregorianToJD(year, month, day);
  const longitude = solarLongitude(jd);
  const def = findSekkiByLongitude(longitude);
  return def.name;
}
