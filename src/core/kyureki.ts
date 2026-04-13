/**
 * 旧暦変換エンジン
 *
 * QREKI.AWK（高野英明氏）のアルゴリズムをTypeScriptに移植。
 * 天保暦に基づく旧暦計算を行う。
 *
 * 対応範囲: 1873-01-01 〜 2100-12-31
 */
import { KYUREKI_MONTH_NAMES, type KyurekiDate } from "./types.js";

// ============================================================
// 定数
// ============================================================

const PI = Math.PI;
const RAD = PI / 180;

/**
 * 日本標準時（JST）のオフセット（日単位）
 * JST = UTC + 9時間 = UTC + 0.375日
 * 天保暦は日本の標準子午線（東経135度）基準
 */
const JST_OFFSET = 9 / 24;

// ============================================================
// ユリウス通日（JD）計算
// ============================================================

/**
 * グレゴリオ暦からユリウス通日を計算する
 * @param year 西暦年
 * @param month 月（1-12）
 * @param day 日（1-31）
 * @returns ユリウス通日
 */
export function gregorianToJD(year: number, month: number, day: number): number {
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return (
    Math.floor(365.25 * (year + 4716)) +
    Math.floor(30.6001 * (month + 1)) +
    day +
    B -
    1524.5
  );
}

/**
 * ユリウス通日からグレゴリオ暦に変換する
 * @param jd ユリウス通日
 * @returns [year, month, day]
 */
export function jdToGregorian(jd: number): [number, number, number] {
  const Z = Math.floor(jd + 0.5);
  const AA = Z >= 2299161
    ? (() => {
        const alpha = Math.floor((Z - 1867216.25) / 36524.25);
        return Z + 1 + alpha - Math.floor(alpha / 4);
      })()
    : Z;
  const B = AA + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);

  const day = B - D - Math.floor(30.6001 * E);
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;

  return [year, month, day];
}

// ============================================================
// 太陽黄経の計算
// ============================================================

/**
 * ユリウス通日から太陽黄経（度）を計算する
 * 簡易版：精度±0.01度程度
 * @param jd ユリウス通日
 * @returns 太陽黄経（0〜360度）
 */
export function solarLongitude(jd: number): number {
  // J2000.0からの経過日数
  const T = (jd - 2451545.0) / 36525.0;

  // 太陽の平均黄経
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  // 太陽の平均近点角
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const Mrad = M * RAD;

  // 太陽の中心方程式
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mrad) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad) +
    0.000289 * Math.sin(3 * Mrad);

  // 太陽の黄経
  const sunLon = L0 + C;

  // 黄道傾斜の補正（章動）
  const omega = 125.04 - 1934.136 * T;
  const longitude = sunLon - 0.00569 - 0.00478 * Math.sin(omega * RAD);

  // 0-360度に正規化
  return ((longitude % 360) + 360) % 360;
}

// ============================================================
// 月の位相計算
// ============================================================

/**
 * ユリウス通日における月の黄経を計算する（簡易版）
 * @param jd ユリウス通日
 * @returns 月の黄経（0〜360度）
 */
function lunarLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525.0;

  // 月の平均黄経
  const Lp = 218.3165 + 481267.8813 * T;
  // 月の平均近点角
  const Mp = 134.9634 + 477198.8676 * T;
  const Mprad = Mp * RAD;
  // 太陽の平均近点角
  const M = 357.5291 + 35999.0503 * T;
  const Mrad = M * RAD;
  // 月の平均伸角
  const D = 297.8502 + 445267.1115 * T;
  const Drad = D * RAD;
  // 月の昇交点の黄経
  const F = 93.2720 + 483202.0175 * T;
  const Frad = F * RAD;

  // 月の黄経の主な摂動項
  const longitude =
    Lp +
    6.289 * Math.sin(Mprad) +
    1.274 * Math.sin(2 * Drad - Mprad) +
    0.658 * Math.sin(2 * Drad) +
    0.214 * Math.sin(2 * Mprad) -
    0.186 * Math.sin(Mrad) -
    0.114 * Math.sin(2 * Frad);

  return ((longitude % 360) + 360) % 360;
}

/**
 * 指定JD近傍の朔（新月）のJDを求める
 * @param jd 基準JD
 * @returns 朔のJD
 */
function findNewMoon(jd: number): number {
  // 月齢の概算値から近傍の新月を推定
  const SYNODIC_MONTH = 29.530588853;

  // 既知の新月（2000年1月6日18:14 UTC）
  const knownNewMoon = 2451550.26;
  const k = Math.round((jd - knownNewMoon) / SYNODIC_MONTH);
  let nmJd = knownNewMoon + k * SYNODIC_MONTH;

  // ニュートン法で精密な朔を求める（10回反復）
  for (let i = 0; i < 10; i++) {
    const sunLon = solarLongitude(nmJd);
    const moonLon = lunarLongitude(nmJd);
    let diff = moonLon - sunLon;
    // -180〜180度に正規化
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    if (Math.abs(diff) < 0.0001) break;
    // 月は1日約13度、太陽は1日約1度進むので、差は1日約12度
    nmJd -= diff / 12;
  }

  return nmJd;
}

/**
 * JDからJST基準の暦日番号（整数）を求める
 * 同じ暦日のJDは同じ整数値を返す
 */
function jdToJstDay(jd: number): number {
  return Math.floor(jd + JST_OFFSET + 0.5);
}

/**
 * 指定JD以降の最初の朔を求める
 */
function findNextNewMoon(jd: number): number {
  const nm = findNewMoon(jd);
  if (nm >= jd - 0.5) return nm;
  return findNewMoon(jd + 30);
}

/**
 * 指定したグレゴリオ暦日付のJST基準で、その日以前の朔を求める
 * @param jd 基準JD（0時UT）
 * @returns 朔のJD
 */
function findPreviousNewMoonJST(jd: number): number {
  const targetDay = jdToJstDay(jd);
  const nm = findNewMoon(jd);
  const nmDay = jdToJstDay(nm);

  if (nmDay <= targetDay) return nm;
  return findNewMoon(jd - 30);
}

/**
 * 指定した太陽黄経に到達するJDを求める
 */
function findSolarLongitudeJD(targetLon: number, approxJd: number): number {
  let jd = approxJd;
  for (let i = 0; i < 20; i++) {
    const currentLon = solarLongitude(jd);
    let delta = targetLon - currentLon;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    if (Math.abs(delta) < 0.0001) break;
    jd += delta / 0.9856;
  }
  return jd;
}

// ============================================================
// 旧暦変換
// ============================================================

/**
 * 指定した朔月（newMoonJd〜次の朔の前日）に中気が含まれるか判定する
 * 中気とは太陽黄経が30度の倍数になる瞬間のこと
 */
function monthContainsChuuki(startNewMoonJd: number, endNewMoonJd: number): boolean {
  const startDay = jdToJstDay(startNewMoonJd);
  const endDay = jdToJstDay(endNewMoonJd);

  // 30度刻みの中気を跨いだかチェック
  for (let d = startDay; d < endDay; d++) {
    const lon1 = solarLongitude(d);
    const lon2 = solarLongitude(d + 1);

    // 黄経が減少する（360→0のラップ）場合
    if (lon2 < lon1 - 180) {
      return true;
    }

    // 通常ケース: 30度の倍数を跨いだか
    const floor1 = Math.floor(lon1 / 30);
    const floor2 = Math.floor(lon2 / 30);
    if (floor1 !== floor2) {
      return true;
    }
  }

  return false;
}

/**
 * 西暦日付を旧暦日付に変換する
 *
 * アルゴリズム:
 * 1. 指定日を挟む2つの冬至を求める
 * 2. 各冬至を含む朔月を「11月」とする
 * 3. 2つの11月の間の朔月数が13なら閏年（中気のない月が閏月）
 * 4. 月番号を11月から順に割り当てる
 *
 * @param year 西暦年
 * @param month 月（1-12）
 * @param day 日（1-31）
 * @returns 旧暦日付
 */
export function toKyureki(year: number, month: number, day: number): KyurekiDate {
  const jd = gregorianToJD(year, month, day);
  const targetDay = jdToJstDay(jd);

  // Step 1: 指定日の前後の冬至（太陽黄経270°）を求める
  const ws1Jd = findSolarLongitudeJD(270, gregorianToJD(year, 12, 21));
  const ws0Jd = findSolarLongitudeJD(270, gregorianToJD(year - 1, 12, 21));
  const ws2Jd = findSolarLongitudeJD(270, gregorianToJD(year + 1, 12, 21));

  // 指定日を挟む冬至のペアを選ぶ
  let prevWs: number, nextWs: number;
  if (targetDay < jdToJstDay(ws1Jd)) {
    prevWs = ws0Jd;
    nextWs = ws1Jd;
  } else {
    prevWs = ws1Jd;
    nextWs = ws2Jd;
  }

  // Step 2: 各冬至を含む朔月（JST基準）を見つける = 11月
  const prevMonth11 = findPreviousNewMoonJST(prevWs);
  const nextMonth11 = findPreviousNewMoonJST(nextWs);

  // Step 3: prevMonth11からnextMonth11の先まで朔を列挙
  const newMoons: number[] = [];
  let nmJd = prevMonth11;
  const limitDay = jdToJstDay(nextMonth11) + 35;
  while (jdToJstDay(nmJd) <= limitDay) {
    newMoons.push(nmJd);
    nmJd = findNextNewMoon(nmJd + 28);
    if (newMoons.length > 16) break;
  }

  // JST基準の暦日に変換
  const newMoonDays = newMoons.map(jdToJstDay);

  // nextMonth11のインデックスを特定
  const nextMonth11Day = jdToJstDay(nextMonth11);
  let nextMonth11Idx = -1;
  for (let i = 1; i < newMoonDays.length; i++) {
    if (Math.abs(newMoonDays[i] - nextMonth11Day) <= 1) {
      nextMonth11Idx = i;
      break;
    }
  }
  if (nextMonth11Idx === -1) {
    nextMonth11Idx = newMoons.length - 2;
  }

  const prevMonth11Idx = 0;
  const monthsBetween = nextMonth11Idx - prevMonth11Idx;
  const hasLeapMonth = monthsBetween > 12;

  // Step 4: 各朔月が中気を含むかチェック
  const hasChuuki: boolean[] = [];
  for (let i = 0; i < newMoons.length - 1; i++) {
    hasChuuki.push(monthContainsChuuki(newMoons[i], newMoons[i + 1]));
  }

  // Step 5: 月番号を割り当てる
  type MonthInfo = {
    startDay: number;
    month: number;
    isLeap: boolean;
  };

  const months: MonthInfo[] = [];
  let curMonth = 11;
  let leapAssigned = false;

  for (let i = 0; i < newMoons.length - 1; i++) {
    let isLeap = false;

    if (hasLeapMonth && !leapAssigned && i > prevMonth11Idx && i < nextMonth11Idx) {
      if (!hasChuuki[i]) {
        isLeap = true;
        leapAssigned = true;
      }
    }

    months.push({
      startDay: newMoonDays[i],
      month: curMonth,
      isLeap,
    });

    if (!isLeap) {
      curMonth++;
      if (curMonth > 12) curMonth = 1;
    }
  }

  // Step 6: 指定日がどの月に属するか
  let resultMonth = 1;
  let resultIsLeap = false;

  for (let i = 0; i < months.length; i++) {
    const startDay = months[i].startDay;
    const endDay = i + 1 < months.length ? months[i + 1].startDay : startDay + 30;

    if (targetDay >= startDay && targetDay < endDay) {
      resultMonth = months[i].month;
      resultIsLeap = months[i].isLeap;
      break;
    }
  }

  // 旧暦日 = 朔日（JST基準）からの日数 + 1
  const currentNewMoon = findPreviousNewMoonJST(jd);
  const kyurekiDay = targetDay - jdToJstDay(currentNewMoon) + 1;

  // 旧暦の年
  let resultYear = year;
  if (resultMonth >= 10 && month <= 3) {
    resultYear = year - 1;
  }

  const monthName = KYUREKI_MONTH_NAMES[resultMonth - 1];

  return {
    year: resultYear,
    month: resultMonth,
    day: kyurekiDay,
    isLeapMonth: resultIsLeap,
    monthName,
  };
}
