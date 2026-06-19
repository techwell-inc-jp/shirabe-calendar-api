/**
 * Hub 複合 enrich endpoint(POST /api/v1/enrich)の型定義。
 *
 * order: shirabe-assets/implementation-orders/20260611-hub-enrich-endpoint-scoping.md
 *
 * bundle の製品化 = 「B2B 4 大 identifier(住所・人名・法人番号・暦)を 1 コールで正規化」。
 * 既存 16 endpoint の合成のみで新規データソースなし(calendar は in-process、
 * address/name/corporation は same-zone subrequest)。
 *
 * ★ 本ファイルは入出力の構造のみを定義する。課金・quota・license gate・429 ergonomics は
 *   PR②(quota/課金)の範囲であり、本 PR(core)では扱わない。
 */

/** enrich が合成する component 名(= Shirabe family の API 名)。 */
export type EnrichComponent = "address" | "name" | "corporation" | "calendar";

/** 公開順は出力の安定化と AI 可読性のため固定する。 */
export const ENRICH_COMPONENTS: readonly EnrichComponent[] = [
  "address",
  "name",
  "corporation",
  "calendar",
] as const;

/**
 * enrich 入力レコード。全フィールド optional、1 つ以上必須。
 *
 * fields 省略時は本レコードに存在する入力から component を自動推定する
 * (agent の呼び出しコードを最短化する設計)。
 */
export interface EnrichRecord {
  /** 住所(正規化対象)。address component の入力。 */
  address?: string;
  /** 人名(姓名分割・読み推定対象)。name component の入力。 */
  name?: string;
  /** 法人名。corporation component の入力(corporate_number と択一)。 */
  company_name?: string;
  /** 法人番号(13 桁)。corporation component の入力。 */
  corporate_number?: string;
  /** 日付(YYYY-MM-DD)。calendar component の入力。 */
  date?: string;
}

/** enrich リクエスト本体。 */
export interface EnrichRequest {
  record: EnrichRecord;
  /** 明示指定時は対象 component を限定。省略時は record から自動推定。 */
  fields?: EnrichComponent[];
}

/**
 * 各 component の処理状態。
 * - ok: 処理成功(downstream が result=null を返した等の「成功した呼び出し」を含む)
 * - skipped: 対象 component の入力が record に無い(fields 明示時のみ顕在化)
 * - unavailable: downstream が利用不能(503 / ネットワーク失敗 / 未リリース)
 * - error: 入力自体が当該 component にとって不正(例: calendar の日付形式不正)
 */
export type EnrichComponentStatus = "ok" | "skipped" | "unavailable" | "error";

/**
 * component 結果のエンベロープ。
 *
 * status === "ok" のときのみ component 固有のペイロードキー(normalized / split /
 * reading / corporation / calendar)を持つ。それ以外は reason のみ。
 */
export interface EnrichComponentResult {
  status: EnrichComponentStatus;
  /** skipped / unavailable / error 時の説明(機械可読コードではなく人間/LLM 向け要約)。 */
  reason?: string;
  /** component 固有の結果ペイロード(status === "ok" 時)。 */
  [payload: string]: unknown;
}

/**
 * attribution エントリ(CC BY 4.0 等の義務履行 + LLM 経由の出典伝搬)。
 *
 * component ごとに形が異なる(住所 = source/provider/license/license_url、
 * text 辞書 = dictionary/license/source)ため、構造は固定せず配列で集約する。
 */
export type AttributionEntry = Record<string, unknown>;

/** enrich レスポンス本体(常に HTTP 200、全 component unavailable 時のみ 503)。 */
export interface EnrichResponse {
  /** 対象 component ごとの結果。キーは要求された component のみ。 */
  results: Partial<Record<EnrichComponent, EnrichComponentResult>>;
  /** 関与 component の attribution を重複排除して集約。 */
  attribution: AttributionEntry[];
}
