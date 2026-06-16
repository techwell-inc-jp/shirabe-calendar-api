/**
 * enrich component の downstream クライアント。
 *
 * order: shirabe-assets/implementation-orders/20260611-hub-enrich-endpoint-scoping.md §2.2
 *
 * - calendar: in-process(暦計算コアを直接呼び出し。self-subrequest を回避し latency を抑える)
 * - address / name / corporation: same-zone subrequest(shirabe.dev 上の別 Worker)
 *
 * 各関数は {@link ComponentOutcome} を返し、例外を投げない(部分成功を上位で集約するため)。
 * downstream の attribution は結果から分離して返し、上位で重複排除して集約する。
 *
 * ★ 課金・quota・internal 非計上(案 X)・license gate は PR②(quota/課金)の範囲。
 *   本ファイルは「合成して返す」ことのみに責務を限定する。
 */
import {
  parseDate,
  isDateInRange,
  getCalendarInfo,
} from "../core/calendar-service.js";
import type { Category } from "../core/types.js";
import type {
  EnrichComponentResult,
  AttributionEntry,
  EnrichRecord,
} from "../types/enrich.js";

/** downstream subrequest のタイムアウト(ms)。最遅 component(address: Fly.io 経由)に律速。 */
const DOWNSTREAM_TIMEOUT_MS = 8000;

/** downstream クライアントの設定。 */
export interface DownstreamConfig {
  /** same-zone API のベース URL(本番 = https://shirabe.dev、テストで差し替え可)。 */
  baseUrl: string;
  /**
   * 内部 subrequest 識別トークン(案 X)。設定時は X-Shirabe-Internal ヘッダに載せ、
   * downstream(address/text/corporation)側が usage を非計上にするための marker とする。
   * downstream 側の認識実装はクロスリポの後続作業(本トークン送信は forward-compat)。
   */
  internalToken?: string;
}

/** internal subrequest を識別するヘッダ名(案 X、downstream 非計上)。 */
const INTERNAL_HEADER = "X-Shirabe-Internal";

/** cfg から共通ヘッダ(Content-Type + 任意の internal marker)を組み立てる。 */
function buildHeaders(cfg: DownstreamConfig, base: Record<string, string>): Record<string, string> {
  return cfg.internalToken ? { ...base, [INTERNAL_HEADER]: cfg.internalToken } : base;
}

/** component 処理の結果 + 集約対象の attribution。 */
export interface ComponentOutcome {
  result: EnrichComponentResult;
  attribution: AttributionEntry[];
}

/**
 * same-zone な JSON API を呼ぶ共通ヘルパー。例外は投げず判別可能な結果で返す。
 *
 * - 2xx: { ok: true, body }
 * - それ以外 / ネットワーク失敗 / タイムアウト: { ok: false, reason }
 */
async function callJson(
  url: string,
  init: RequestInit
): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(DOWNSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { ok: false, reason: `downstream responded ${res.status}` };
    }
    const body = (await res.json()) as unknown;
    return { ok: true, body };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "TimeoutError"
        ? "downstream timed out"
        : "downstream unreachable";
    return { ok: false, reason };
  }
}

/**
 * オブジェクトから `attribution` を取り除き、本体と attribution を分離する。
 *
 * downstream の応答本体には attribution が同梱されるが、enrich は top-level に集約するため
 * component ペイロードからは除去する(CC BY 4.0 の義務は集約配列側で履行)。
 */
function splitAttribution(body: unknown): {
  payload: Record<string, unknown>;
  attribution: AttributionEntry[];
} {
  if (typeof body !== "object" || body === null) {
    return { payload: {}, attribution: [] };
  }
  const { attribution, ...rest } = body as Record<string, unknown>;
  const collected: AttributionEntry[] = [];
  if (attribution && typeof attribution === "object") {
    collected.push(attribution as AttributionEntry);
  }
  return { payload: rest, attribution: collected };
}

/**
 * address component。住所正規化 API を same-zone で呼ぶ。
 *
 * 住所 API は not-found / ambiguous でも HTTP 200(result=null + error)を返すため、
 * 呼び出しが成功すれば status="ok"(result の中身に関わらず)。
 */
export async function enrichAddress(
  address: string,
  cfg: DownstreamConfig
): Promise<ComponentOutcome> {
  const out = await callJson(`${cfg.baseUrl}/api/v1/address/normalize`, {
    method: "POST",
    headers: buildHeaders(cfg, { "Content-Type": "application/json" }),
    body: JSON.stringify({ address }),
  });
  if (!out.ok) {
    return { result: { status: "unavailable", reason: out.reason }, attribution: [] };
  }
  const { payload, attribution } = splitAttribution(out.body);
  return { result: { status: "ok", normalized: payload }, attribution };
}

/**
 * name component。姓名分割 + 読み推定を並列で呼び、1 つの結果に合成する。
 *
 * 両方失敗時のみ unavailable。片方のみ成功時は ok とし、欠けた側は null。
 */
export async function enrichName(
  name: string,
  cfg: DownstreamConfig
): Promise<ComponentOutcome> {
  const headers = buildHeaders(cfg, { "Content-Type": "application/json" });
  const [splitOut, readingOut] = await Promise.all([
    callJson(`${cfg.baseUrl}/api/v1/text/name-split`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name }),
    }),
    callJson(`${cfg.baseUrl}/api/v1/text/name-reading`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name }),
    }),
  ]);

  if (!splitOut.ok && !readingOut.ok) {
    return {
      result: { status: "unavailable", reason: splitOut.reason },
      attribution: [],
    };
  }

  const attribution: AttributionEntry[] = [];
  let split: Record<string, unknown> | null = null;
  let reading: Record<string, unknown> | null = null;

  if (splitOut.ok) {
    const s = splitAttribution(splitOut.body);
    split = s.payload;
    attribution.push(...s.attribution);
  }
  if (readingOut.ok) {
    const r = splitAttribution(readingOut.body);
    reading = r.payload;
    attribution.push(...r.attribution);
  }

  return { result: { status: "ok", split, reading }, attribution };
}

/**
 * corporation component。法人番号 → lookup、法人名 → search の順で解決する。
 *
 * 呼び出し先 corporation API は **POST + JSON body** 契約(`{ law_id }` / `{ name }`)。
 * 形式は corporation repo の実ルート(`POST /api/v1/corporation/{lookup,search}`)に一致させる。
 *
 * 法人番号 API は 2026-06-29 リリース予定。それ以前は same-zone route が未配置のため
 * downstream 失敗 = unavailable で graceful degrade する(他 component は返る)。
 */
export async function enrichCorporation(
  record: Pick<EnrichRecord, "corporate_number" | "company_name">,
  cfg: DownstreamConfig
): Promise<ComponentOutcome> {
  let url: string;
  let payloadBody: Record<string, string>;
  let mode: "lookup" | "search";
  if (record.corporate_number) {
    url = `${cfg.baseUrl}/api/v1/corporation/lookup`;
    payloadBody = { law_id: record.corporate_number };
    mode = "lookup";
  } else if (record.company_name) {
    url = `${cfg.baseUrl}/api/v1/corporation/search`;
    payloadBody = { name: record.company_name };
    mode = "search";
  } else {
    return { result: { status: "skipped", reason: "no corporation input" }, attribution: [] };
  }

  const out = await callJson(url, {
    method: "POST",
    headers: buildHeaders(cfg, { "Content-Type": "application/json" }),
    body: JSON.stringify(payloadBody),
  });
  if (!out.ok) {
    return { result: { status: "unavailable", reason: out.reason }, attribution: [] };
  }
  const { payload, attribution } = splitAttribution(out.body);
  // corp endpoint 自前のエンベロープ(lookup: { corporation }, search: { results, count })を
  // 1 枚剥がし、他 component と payload 深さを揃える(Option A、2026-06-16 経営者サインオフ)。
  //   lookup → results.corporation.corporation = record(calendar の results.calendar.calendar と対称)
  //   search → results.corporation.matches = records[] + count
  const result: EnrichComponentResult =
    mode === "lookup"
      ? { status: "ok", corporation: payload.corporation ?? null }
      : { status: "ok", matches: payload.results ?? [], count: payload.count ?? 0 };
  return { result, attribution };
}

/**
 * calendar component。暦計算コアを in-process で呼ぶ(subrequest しない)。
 *
 * 日付形式不正 / 範囲外は error(他 component に影響させない)。
 */
export function enrichCalendar(date: string): ComponentOutcome {
  const parsed = parseDate(date);
  if (!parsed || !isDateInRange(parsed[0], parsed[1], parsed[2])) {
    return {
      result: {
        status: "error",
        reason: "date must be YYYY-MM-DD between 1873-01-01 and 2100-12-31",
      },
      attribution: [],
    };
  }
  const [year, month, day] = parsed;
  const categories: Category[] | undefined = undefined;
  const calendar = getCalendarInfo(year, month, day, categories);
  return { result: { status: "ok", calendar }, attribution: [] };
}
