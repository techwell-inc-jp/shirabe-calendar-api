/**
 * S1 計測基盤: /internal/stats エンドポイント
 *
 * Basic認証で保護された管理ダッシュボード用API。
 * Cloudflare Analytics Engine SQL API を叩いて集計結果をJSONで返す。
 *
 * クエリパラメータ:
 *   from=YYYY-MM-DD   集計開始日(必須、UTC基準)
 *   to=YYYY-MM-DD     集計終了日(必須、UTC基準、排他的上限)
 *
 * セキュリティ:
 * - Basic認証は INTERNAL_STATS_USER / INTERNAL_STATS_PASS で検証
 * - 定数時間比較(constant-time compare)で timing attack を回避
 * - 日付クエリは /^\d{4}-\d{2}-\d{2}$/ で厳格検証し、SQLインジェクション対策
 * - SQL文はサーバー側でハードコードし、ユーザー入力を直接埋め込まない
 */
import { Hono } from "hono";
import type { AppEnv, Env } from "../types/env.js";

const internalStats = new Hono<AppEnv>();

/** 日付文字列の検証用正規表現(YYYY-MM-DD、UTC基準) */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** デフォルトのデータセット名(wrangler.tomlと一致させる) */
const AE_DATASET = "shirabe_calendar_events";

/**
 * エンドポイント本体。
 */
internalStats.get("/stats", async (c) => {
  // --- 1. Basic認証 ---
  const authResult = verifyBasicAuth(c.req.header("Authorization"), c.env);
  if (!authResult.ok) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: authResult.message,
        },
      },
      401,
      {
        "WWW-Authenticate": 'Basic realm="internal"',
      }
    );
  }

  // --- 2. 設定チェック(AE SQL API用のSecretが揃っているか) ---
  const accountId = c.env.CF_ACCOUNT_ID;
  const aeToken = c.env.CF_AE_READ_TOKEN;
  if (!accountId || !aeToken) {
    return c.json(
      {
        error: {
          code: "CONFIG_MISSING",
          message: "CF_ACCOUNT_ID and CF_AE_READ_TOKEN must be configured",
        },
      },
      500
    );
  }

  // --- 3. クエリパラメータ検証 ---
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (!from || !to || !DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAMS",
          message: "from and to are required (format: YYYY-MM-DD)",
        },
      },
      400
    );
  }
  if (from > to) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAMS",
          message: "from must be <= to",
        },
      },
      400
    );
  }

  // --- 4. AE SQL API 呼び出し ---
  // UA category別 / エンドポイント別 / プラン別 の集計を1クエリで返す。
  // 日付は既に厳格検証済み(YYYY-MM-DD)のためSQLインジェクション不可。
  const sql = buildStatsSQL(from, to);

  try {
    const result = await queryAnalyticsEngine({
      accountId,
      token: aeToken,
      sql,
    });
    return c.json({
      range: { from, to },
      dataset: AE_DATASET,
      rows: result.data ?? [],
      meta: result.meta ?? null,
    });
  } catch (err) {
    console.error("[internal-stats] AE SQL query failed", err);
    const message = err instanceof Error ? err.message : String(err);
    return c.json(
      {
        error: {
          code: "AE_QUERY_FAILED",
          message,
        },
      },
      502
    );
  }
});

// ---------------------------------------------------------------------------
// Basic認証
// ---------------------------------------------------------------------------

export type AuthResult = { ok: true } | { ok: false; message: string };

/**
 * Authorizationヘッダーを検証する。
 * - ヘッダー欠落・形式不正は `ok:false`
 * - 認証情報未設定(Secret未設定)のWorkerでは全拒否
 *
 * 他の internal endpoint(例: /internal/indexnow/submit)からも再利用するため
 * export している。同じ INTERNAL_STATS_USER / INTERNAL_STATS_PASS を共用する設計。
 */
export function verifyBasicAuth(authHeader: string | undefined, env: Env): AuthResult {
  const expectedUser = env.INTERNAL_STATS_USER;
  const expectedPass = env.INTERNAL_STATS_PASS;
  if (!expectedUser || !expectedPass) {
    return { ok: false, message: "Internal stats credentials not configured" };
  }
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return { ok: false, message: "Missing or invalid Authorization header" };
  }
  const encoded = authHeader.slice("Basic ".length).trim();
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return { ok: false, message: "Invalid base64 in Authorization header" };
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) {
    return { ok: false, message: "Invalid Basic auth format" };
  }
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  // 定数時間比較(長さ不一致でも常に同じ時間で比較する)
  const userOk = constantTimeEquals(user, expectedUser);
  const passOk = constantTimeEquals(pass, expectedPass);
  if (userOk && passOk) {
    return { ok: true };
  }
  return { ok: false, message: "Invalid credentials" };
}

/**
 * 2つの文字列を定数時間で比較する(timing attack 対策)。
 * 長さが異なる場合でも常に比較ループを回し、最終的に長さ不一致で false を返す。
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// AE SQL クエリ構築
// ---------------------------------------------------------------------------

/**
 * 集計用SQLを組み立てる。
 *
 * `from` / `to` は呼出元で `/^\d{4}-\d{2}-\d{2}$/` 検証済みのため、直接埋め込んでも
 * SQLインジェクションは発生しない(ダブルクォート含む文字は入り得ない)。
 */
export function buildStatsSQL(from: string, to: string): string {
  return [
    "SELECT",
    "  blob1 AS ua_category,",
    "  blob2 AS ai_vendor,",
    "  blob3 AS referrer_type,",
    "  blob4 AS referrer_vendor,",
    "  blob5 AS endpoint_kind,",
    "  blob7 AS plan,",
    "  blob9 AS tool_hint,",
    "  count() AS requests,",
    "  sum(double2) AS success_count",
    `FROM ${AE_DATASET}`,
    `WHERE timestamp >= toDateTime('${from} 00:00:00')`,
    `  AND timestamp <  toDateTime('${to} 00:00:00')`,
    "GROUP BY ua_category, ai_vendor, referrer_type, referrer_vendor, endpoint_kind, plan, tool_hint",
    "ORDER BY requests DESC",
    "LIMIT 10000",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// AE SQL API 呼び出し
// ---------------------------------------------------------------------------

type AEQueryInput = {
  accountId: string;
  token: string;
  sql: string;
};

type AEQueryResult = {
  data?: unknown[];
  meta?: unknown;
};

/**
 * Cloudflare Analytics Engine SQL API を呼び出す。
 *
 * 失敗時(非2xx・ネットワークエラー)は例外を投げる。
 */
export async function queryAnalyticsEngine(input: AEQueryInput): Promise<AEQueryResult> {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/analytics_engine/sql`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "text/plain",
    },
    body: input.sql,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AE SQL API ${res.status}: ${text.slice(0, 500)}`);
  }
  const body = (await res.json()) as AEQueryResult;
  return body;
}

export { internalStats };
