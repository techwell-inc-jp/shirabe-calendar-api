/**
 * enrich orchestration — 入力検証 / component 推定 / 並列実行 / attribution 集約 / status 判定。
 *
 * order: shirabe-assets/implementation-orders/20260611-hub-enrich-endpoint-scoping.md
 *
 * 設計方針:
 * - component は全て並列実行(latency = 最遅 1 つ分。直列にしない)。
 * - per-component 部分成功。全 attempted component が unavailable のときのみ HTTP 503。
 * - attribution は component を跨いで重複排除して集約(CC BY 4.0 伝搬)。
 *
 * ★ 課金・quota・license gate・429 ergonomics は PR②(quota/課金)で route に追加する。
 *   本サービスは「検証して合成する」純粋寄りのロジックに責務を限定する。
 */
import {
  ENRICH_COMPONENTS,
  type EnrichComponent,
  type EnrichRecord,
  type EnrichComponentResult,
  type AttributionEntry,
  type EnrichResponse,
} from "../types/enrich.js";
import {
  enrichAddress,
  enrichName,
  enrichCorporation,
  enrichCalendar,
  type DownstreamConfig,
  type ComponentOutcome,
} from "./downstream.js";

/** record に指定できる入力キー(検証用)。 */
const RECORD_STRING_FIELDS = [
  "address",
  "name",
  "company_name",
  "corporate_number",
  "date",
] as const;

/** 標準エラーレスポンス形(`{ error: { code, message, details? } }`)。 */
export interface EnrichError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/** 検証結果。ok 時は正規化済みの record + 実行対象 component を返す。 */
export type ValidationResult =
  | { ok: true; record: EnrichRecord; fields: EnrichComponent[] }
  | { ok: false; error: EnrichError };

function isComponent(value: unknown): value is EnrichComponent {
  return typeof value === "string" && (ENRICH_COMPONENTS as readonly string[]).includes(value);
}

/**
 * enrich リクエスト本体を検証し、record と実行対象 component を確定する。
 *
 * - record は object 必須。既知フィールドは string のみ許容。1 つ以上の入力が必須。
 * - fields は省略可。指定時は component 名の配列(重複は除去)。省略時は record から自動推定。
 */
export function validateEnrichRequest(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "Body must be a JSON object" } };
  }
  const root = body as Record<string, unknown>;

  if (typeof root.record !== "object" || root.record === null || Array.isArray(root.record)) {
    return {
      ok: false,
      error: { code: "INVALID_REQUEST", message: "'record' is required and must be an object" },
    };
  }
  const rawRecord = root.record as Record<string, unknown>;

  const record: EnrichRecord = {};
  for (const key of RECORD_STRING_FIELDS) {
    const value = rawRecord[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") {
      return {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: `record.${key}, if provided, must be a string`,
          details: { field: key },
        },
      };
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    record[key] = trimmed;
  }

  if (Object.keys(record).length === 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: `record must contain at least one of: ${RECORD_STRING_FIELDS.join(", ")}`,
        details: { allowed: RECORD_STRING_FIELDS },
      },
    };
  }

  let fields: EnrichComponent[];
  if (root.fields === undefined) {
    fields = detectFields(record);
  } else {
    if (!Array.isArray(root.fields) || !root.fields.every(isComponent)) {
      return {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: `'fields', if provided, must be an array of: ${ENRICH_COMPONENTS.join(", ")}`,
          details: { allowed: ENRICH_COMPONENTS },
        },
      };
    }
    // 重複除去しつつ正規順序を維持。
    fields = ENRICH_COMPONENTS.filter((c) => (root.fields as EnrichComponent[]).includes(c));
  }

  return { ok: true, record, fields };
}

/** record に存在する入力から実行対象 component を推定する。 */
export function detectFields(record: EnrichRecord): EnrichComponent[] {
  const fields: EnrichComponent[] = [];
  if (record.address) fields.push("address");
  if (record.name) fields.push("name");
  if (record.corporate_number || record.company_name) fields.push("corporation");
  if (record.date) fields.push("calendar");
  return fields;
}

/** 当該 component の入力が record に存在するか。 */
function hasInput(component: EnrichComponent, record: EnrichRecord): boolean {
  switch (component) {
    case "address":
      return Boolean(record.address);
    case "name":
      return Boolean(record.name);
    case "corporation":
      return Boolean(record.corporate_number || record.company_name);
    case "calendar":
      return Boolean(record.date);
  }
}

/** 入力欠如時の skipped 理由。 */
function skippedReason(component: EnrichComponent): string {
  switch (component) {
    case "address":
      return "no address input";
    case "name":
      return "no name input";
    case "corporation":
      return "no corporation input (company_name or corporate_number)";
    case "calendar":
      return "no date input";
  }
}

/** attribution を JSON 等価で重複排除する。 */
function dedupeAttribution(entries: AttributionEntry[]): AttributionEntry[] {
  const seen = new Set<string>();
  const result: AttributionEntry[] = [];
  for (const entry of entries) {
    const key = JSON.stringify(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
}

/** enrich 実行結果(HTTP status + レスポンス本体)。 */
export interface EnrichRunResult {
  status: 200 | 503;
  body: EnrichResponse;
}

/**
 * 検証済み record と実行対象 component を受け、全 component を並列実行して合成する。
 */
export async function runEnrich(
  record: EnrichRecord,
  fields: EnrichComponent[],
  cfg: DownstreamConfig
): Promise<EnrichRunResult> {
  // 入力のある component のみ実際に実行(全並列)。欠如分は skipped で即時確定。
  const attempted = fields.filter((c) => hasInput(c, record));

  const outcomes = await Promise.all(
    attempted.map(async (component): Promise<[EnrichComponent, ComponentOutcome]> => {
      const outcome = await runComponent(component, record, cfg);
      return [component, outcome];
    })
  );
  const outcomeMap = new Map<EnrichComponent, ComponentOutcome>(outcomes);

  // results は fields の正規順序で組み立てる(AI 可読性のため出力キー順を安定化)。
  const results: Partial<Record<EnrichComponent, EnrichComponentResult>> = {};
  const attribution: AttributionEntry[] = [];

  for (const component of fields) {
    const outcome = outcomeMap.get(component);
    if (outcome) {
      results[component] = outcome.result;
      attribution.push(...outcome.attribution);
    } else {
      results[component] = { status: "skipped", reason: skippedReason(component) };
    }
  }

  // 全滅(attempted が 1 つ以上あり、その全てが unavailable)時のみ 503。
  const allUnavailable =
    attempted.length > 0 &&
    outcomes.every(([, outcome]) => outcome.result.status === "unavailable");

  return {
    status: allUnavailable ? 503 : 200,
    body: { results, attribution: dedupeAttribution(attribution) },
  };
}

/** 単一 component を実行する(calendar は in-process、他は same-zone fetch)。 */
function runComponent(
  component: EnrichComponent,
  record: EnrichRecord,
  cfg: DownstreamConfig
): Promise<ComponentOutcome> {
  switch (component) {
    case "address":
      return enrichAddress(record.address as string, cfg);
    case "name":
      return enrichName(record.name as string, cfg);
    case "corporation":
      return enrichCorporation(record, cfg);
    case "calendar":
      return Promise.resolve(enrichCalendar(record.date as string));
  }
}
