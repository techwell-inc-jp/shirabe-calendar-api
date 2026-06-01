/**
 * Pricing quote route — 穴1 群1「即時自動見積」endpoint
 * (order: 20260530-gap1-org-self-serve-licensing-funnel.md §4.2)
 *
 *   GET  /api/v1/pricing/quote?apis=address,text&volume=500000&sla=1&dataset=0
 *   POST /api/v1/pricing/quote   { apis, est_monthly_volume, need_sla?, need_dataset? }
 *
 * 認証不要・AI-callable。org 代理 AI / 開発者が営業ゼロで「いくら / 何が付くか」を即取得。
 * 純粋ロジックは src/pricing/quote.ts。本 route は入力 parse + エラー整形のみ。
 *
 * ★ /api/v1/checkout と同様、/api/* 認証ミドルウェアより前に登録して auth をバイパスする
 *   (index.ts の登録順に依存)。
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/env.js";
import {
  recommendQuote,
  quoteToJson,
  buildOnePagerUrl,
  type ApiName,
  type QuoteInput,
} from "../pricing/quote.js";

/** 受理する API 名。 */
const VALID_APIS: readonly ApiName[] = ["address", "text", "calendar", "corporation"];

/** 1 見積で受理する最大 volume(非現実的な巨大値の弾き)。 */
export const MAX_VOLUME = 1_000_000_000;

/**
 * 任意入力を ApiName[] に正規化する。未知の API 名は無視(throw しない)。
 * 配列 / カンマ区切り文字列の両方を受理。
 */
function parseApis(raw: unknown): ApiName[] {
  let tokens: string[];
  if (Array.isArray(raw)) {
    tokens = raw.map((x) => String(x));
  } else if (typeof raw === "string") {
    tokens = raw.split(",");
  } else {
    return [];
  }
  const out: ApiName[] = [];
  for (const t of tokens) {
    const name = t.trim().toLowerCase();
    if ((VALID_APIS as readonly string[]).includes(name) && !out.includes(name as ApiName)) {
      out.push(name as ApiName);
    }
  }
  return out;
}

/** 任意入力を boolean に正規化(`true`/`1`/`yes`/`on` を true)。 */
function parseBool(raw: unknown): boolean {
  if (raw === true) return true;
  if (typeof raw === "number") return raw === 1;
  if (typeof raw === "string") return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
  return false;
}

/** 任意入力を有限・非負・上限内の volume に正規化。不正は -1(後段で 400)。 */
function parseVolume(raw: unknown): number {
  const n = typeof raw === "string" ? Number(raw) : (raw as number);
  if (!Number.isFinite(n) || n < 0 || n > MAX_VOLUME) return -1;
  return Math.floor(n);
}

/**
 * クエリ getter(`apis` / `volume` / `sla` / `dataset`)から見積入力を組み立てる。
 * GET /quote と /pricing/one-pager(index.ts)で共有し、parse 規則の単一化を保つ。
 *
 * @param get クエリ値を返す関数(`c.req.query` を渡す)
 * @returns 正規化済み入力、または volume 不正時の errorMessage
 */
export function parseQuoteFromQuery(
  get: (key: string) => string | undefined
): { input?: QuoteInput; errorMessage?: string } {
  const volume = parseVolume(get("volume"));
  if (volume < 0) {
    return { errorMessage: `'volume' must be a number between 0 and ${MAX_VOLUME}` };
  }
  return {
    input: {
      apis: parseApis(get("apis")),
      estMonthlyVolume: volume,
      needSla: parseBool(get("sla")),
      needDataset: parseBool(get("dataset")),
    },
  };
}

/** 正規化済み入力から見積を計算して JSON レスポンスを返す(one-pager 導線を同梱)。 */
function buildResponse(input: QuoteInput) {
  const quote = recommendQuote(input);
  return { ...quoteToJson(quote), one_pager_url: buildOnePagerUrl(input) };
}

export const pricing = new Hono<AppEnv>();

pricing.get("/quote", (c) => {
  const { input, errorMessage } = parseQuoteFromQuery((k) => c.req.query(k));
  if (!input) {
    return c.json({ error: { code: "INVALID_PARAMETER", message: errorMessage! } }, 400);
  }
  return c.json(buildResponse(input));
});

pricing.post("/quote", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: { code: "INVALID_BODY", message: "Body must be valid JSON" } }, 400);
  }
  const volume = parseVolume(body.est_monthly_volume);
  if (volume < 0) {
    return c.json(
      { error: { code: "INVALID_PARAMETER", message: `'est_monthly_volume' must be a number between 0 and ${MAX_VOLUME}` } },
      400
    );
  }
  const input: QuoteInput = {
    apis: parseApis(body.apis),
    estMonthlyVolume: volume,
    needSla: parseBool(body.need_sla),
    needDataset: parseBool(body.need_dataset),
  };
  return c.json(buildResponse(input));
});
