/**
 * SEO Tier 化基盤(Layer A、PR #37)
 *
 * GSC 仮説 B(品質判定)対策の中核。shirabe.dev は約 91K の機械生成 URL を持つが、
 * Google が「同質テンプレート + 量で push」と判定して大量 indexing 保留(2026-04-28
 * verify、登録済 1 / 未登録 67)。Tier 化で URL を需要・AI 利用想定別に分類し、
 * Tier 1 を richer 化、Tier 3 を簡素化することで「site 全体の品質 distribution」を
 * Google + AI 両方に send する signal を改善する。
 *
 * 詳細方針: shirabe-assets/knowledge/content-uniqueness-strengthening.md §2.1 Layer A
 *
 * 200 万円目標連結:
 *   Tier 1(直近 2 年)が AI クエリの主戦場 → 住所 API 月 100 万円 + 法人番号 API
 *   月 50-150 万円 + text API 月 65 万円 の AI 検索引用 reach 強化に直接寄与。
 */

/** SEO Tier 区分(直近高需要 → low demand の 3 段階) */
export type Tier = 1 | 2 | 3;

/**
 * 指定年の Tier を判定する。
 *
 * @param year 西暦年
 * @param currentYear 基準年(デフォルト: 現在の UTC 年、テストでは固定値を渡せる)
 * @returns
 *   - **Tier 1**: 直近 2 年(`currentYear` 〜 `currentYear + 1`、AI クエリ主戦場)
 *   - **Tier 2**: ±5 年(`currentYear - 5` 〜 `currentYear + 5`、Tier 1 除く、中期需要)
 *   - **Tier 3**: それ以外(歴史日付 + 遠未来、low demand)
 *
 * `currentYear` を引数化することで、テスト deterministic 化と将来の年跨ぎ対応を両立。
 * 本番は引数省略(モジュールが読み込まれた時点の年が使われる)。
 */
export function getDayTier(
  year: number,
  currentYear: number = new Date().getUTCFullYear()
): Tier {
  if (year >= currentYear && year <= currentYear + 1) return 1;
  if (year >= currentYear - 5 && year <= currentYear + 5) return 2;
  return 3;
}

/**
 * 用途別月間ランキング(`/purposes/{slug}/{YYYY-MM}/`)の Tier 判定。
 *
 * 現状は year のみで判定(month 単位の細粒度は不要、year 単位で needs/demand が
 * ほぼ決定するため)。将来 month 別の demand 差を観測したら拡張する。
 */
export function getPurposeMonthTier(
  year: number,
  _month: number,
  currentYear: number = new Date().getUTCFullYear()
): Tier {
  return getDayTier(year, currentYear);
}

// ---------------------------------------------------------------------------
// Sitemap priority / changefreq テーブル(Tier-aware)
// ---------------------------------------------------------------------------

/**
 * `/days/{date}/` の sitemap priority(Tier 別)。
 *
 * Why:
 *   - Tier 1(0.9): AI クエリの主戦場、Google + AI 両方に高 priority で signal
 *   - Tier 2(0.5): 中期需要、現状 default を維持(過去テストとの compatibility)
 *   - Tier 3(0.3): 歴史日付 + 遠未来、low demand を明示
 */
export const SITEMAP_DAYS_PRIORITY: Record<Tier, string> = {
  1: "0.9",
  2: "0.5",
  3: "0.3",
};

/**
 * `/days/{date}/` の sitemap changefreq(Tier 別)。
 *
 * Why:
 *   - Tier 1(weekly): 直近年は内部リンク密度向上 + 関連記事追加の頻度高
 *   - Tier 2(yearly): 年 1 回の lastmod でも crawl 充足
 *   - Tier 3(yearly): 過去日付は不変、yearly で十分
 */
export const SITEMAP_DAYS_CHANGEFREQ: Record<Tier, string> = {
  1: "weekly",
  2: "yearly",
  3: "yearly",
};

/**
 * `/purposes/{slug}/{YYYY-MM}/` の sitemap priority(Tier 別)。
 *
 * Why:
 *   - Tier 1(0.8): 直近 2 年の用途別ランキング、AI クエリ主戦場
 *   - Tier 2(0.6): 現状 default を維持
 *   - Tier 3(0.4): 過去 + 遠未来、low demand を明示
 */
export const SITEMAP_PURPOSES_PRIORITY: Record<Tier, string> = {
  1: "0.8",
  2: "0.6",
  3: "0.4",
};

/**
 * `/purposes/{slug}/{YYYY-MM}/` の sitemap changefreq(Tier 別、全 Tier で monthly)。
 *
 * 月別ランキングの性質上、changefreq は全 Tier で monthly が妥当(score ベース算出は
 * deterministic、月の進行で「過去月/現在月/未来月」の意味合いが変わる)。
 */
export const SITEMAP_PURPOSES_CHANGEFREQ: Record<Tier, string> = {
  1: "monthly",
  2: "monthly",
  3: "monthly",
};
