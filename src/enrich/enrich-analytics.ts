/**
 * enrich の Analytics Engine signal(order §5)。
 *
 * 既存のグローバル analytics ミドルウェア(1req=1書込)に加え、enrich 固有の funnel 計測として
 * `enrich_request` イベントを additive に記録する(licenses.ts が独自 signal を出すのと同型)。
 *
 * ★ PII 非保持: 入力 record の内容(住所・氏名・法人名等)は AE に一切書かない。
 *   component_mix は component 名(address/name/corporation/calendar)のみ。
 *
 * blobs:
 *   0: イベント種別  "enrich_request"
 *   1: component_mix "address+calendar+name"(canonical 順、attempted のみ)
 *   2: auth_mode     anonymous / license
 *   3: ua_category   ai / human / bot
 *   4: tool_hint     gpts / langchain / dify / llamaindex / none
 * doubles:
 *   0: attempted component 数
 *   1: 成功(ok)component 数
 * indexes: ["enrich_request"]
 */
import type { AnalyticsEngineDataset } from "../types/env.js";

/** AE 上で enrich リクエストを識別する index marker。 */
export const ENRICH_REQUEST_INDEX = "enrich_request";

/** enrich_request signal の属性(PII を含めない)。 */
export interface EnrichRequestSignal {
  componentMix: string;
  authMode: "anonymous" | "license";
  uaCategory: string;
  toolHint: string;
  componentCount: number;
  successCount: number;
}

/**
 * enrich_request イベントを Analytics Engine に記録する。
 *
 * binding 未設定(ローカル開発等)はスキップ。失敗はレスポンスに影響させない。
 */
export function emitEnrichRequestSignal(
  dataset: AnalyticsEngineDataset | undefined,
  signal: EnrichRequestSignal
): void {
  if (!dataset || typeof dataset.writeDataPoint !== "function") return;
  try {
    dataset.writeDataPoint({
      blobs: [
        ENRICH_REQUEST_INDEX,
        signal.componentMix,
        signal.authMode,
        signal.uaCategory,
        signal.toolHint,
      ],
      doubles: [signal.componentCount, signal.successCount],
      indexes: [ENRICH_REQUEST_INDEX],
    });
  } catch (err) {
    // 計測失敗はユーザーに影響させない。
    console.error("[enrich] writeDataPoint failed", err);
  }
}
