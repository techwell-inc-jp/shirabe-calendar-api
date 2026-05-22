/**
 * G-A Phase 1: /internal/correlation エンドポイント
 *
 * Basic 認証で保護された cross-API correlation 読出 API。
 * shirabe-assets/scripts/cross-api-aggregate.ts(GitHub Actions weekly cron)から
 * 呼ばれ、各 API repo の correlation:* KV エントリを集約して api_concurrency_rate /
 * set_contract_arpu を算出する。
 *
 * 仕様:
 *   GET /internal/correlation?cursor={cursor}
 *   - Basic 認証(INTERNAL_STATS_USER / INTERNAL_STATS_PASS、internal-stats と共用)
 *   - KV list で prefix "correlation:" を返却(1 page = 最大 1000 entries)
 *   - response: { api: "calendar", entries: [...], next_cursor?: string }
 *
 * セキュリティ:
 *   - Basic 認証は internal-stats と同 credential
 *   - email は KV 内で SHA-256 hash 化済(平文 email は KV に存在しない)
 *   - cursor は KV list 由来の opaque string、信頼境界外入力としてそのまま KV に渡す
 *     (KV API は cursor 検証をライブラリ側で行うため、ここでは pass-through で安全)
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/env.js";
import { verifyBasicAuth } from "./internal-stats.js";

const internalCorrelation = new Hono<AppEnv>();

/** API 識別子(calendar 固定、他 repo は別の値) */
const API_NAME = "calendar";

/** 1 page あたりの最大 entry 数 */
const PAGE_LIMIT = 1000;

interface CorrelationEntry {
  api: string;
  stripe_customer_id?: string;
  plan: string;
  status: "active" | "suspended" | "canceled";
  subscribed_at: string;
  updated_at: string;
}

interface CorrelationResponse {
  api: string;
  entries: Array<{ email_sha256: string } & CorrelationEntry>;
  next_cursor?: string;
}

internalCorrelation.get("/correlation", async (c) => {
  // --- 1. Basic 認証 ---
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

  // --- 2. cursor 取得 ---
  const cursor = c.req.query("cursor");

  // --- 3. KV list ---
  const listResult = await c.env.USAGE_LOGS.list({
    prefix: "correlation:",
    limit: PAGE_LIMIT,
    cursor: cursor || undefined,
  });

  // --- 4. 各 key の値を fetch ---
  const entries: CorrelationResponse["entries"] = [];
  for (const key of listResult.keys) {
    const emailHash = key.name.slice("correlation:".length);
    const valueStr = await c.env.USAGE_LOGS.get(key.name);
    if (!valueStr) continue;
    try {
      const entry = JSON.parse(valueStr) as CorrelationEntry;
      entries.push({ email_sha256: emailHash, ...entry });
    } catch {
      // 破損 entry はスキップ(log なし、batch script 側で count されない = drift OK)
    }
  }

  const response: CorrelationResponse = {
    api: API_NAME,
    entries,
  };

  // KV list の cursor は list_complete=false の場合のみ存在
  if (!listResult.list_complete && listResult.cursor) {
    response.next_cursor = listResult.cursor;
  }

  return c.json(response);
});

export { internalCorrelation };
