/**
 * 六曜計算
 *
 * 旧暦の月日から六曜を算出する。
 * 算出式: (旧暦月 + 旧暦日) % 6
 */
import type { KyurekiDate, RokuyoInfo } from "./types.js";
import { ROKUYO_DATA, ROKUYO_INDEX } from "../data/rokuyo-data.js";

/**
 * 旧暦日付から六曜を算出する
 * @param kyureki 旧暦日付
 * @returns 六曜情報
 */
export function calcRokuyo(kyureki: KyurekiDate): RokuyoInfo {
  const index = (kyureki.month + kyureki.day) % 6;
  const name = ROKUYO_INDEX[index];
  return ROKUYO_DATA[name];
}
