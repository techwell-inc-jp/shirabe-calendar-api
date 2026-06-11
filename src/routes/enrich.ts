/**
 * Hub 複合 enrich endpoint(POST /api/v1/enrich)。
 *
 * order: shirabe-assets/implementation-orders/20260611-hub-enrich-endpoint-scoping.md
 *
 * 「B2B 4 大 identifier(住所・人名・法人番号・暦)を 1 コールで正規化」する hub の本丸。
 * 既存 endpoint の合成(calendar = in-process、address/name/corporation = same-zone subrequest)
 * で新規データソースなし。常に HTTP 200、全 component unavailable 時のみ 503。
 *
 * ★ 登録順依存(index.ts): 本 route は /api/* 認証ミドルウェアより前に登録し、独自の
 *   quota / license gate(PR②)を route 内で持つ。本 PR(core)では合成のみを実装する。
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/env.js";
import { validateEnrichRequest, runEnrich } from "../enrich/enrich-service.js";

export const enrich = new Hono<AppEnv>();

/**
 * 複合 enrich を実行する。
 *
 * body = { record: {address?, name?, company_name?, corporate_number?, date?}, fields?: [...] }
 * fields 省略時は record に存在する入力から component を自動推定する。
 */
enrich.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: "INVALID_BODY", message: "Body must be valid JSON" } }, 400);
  }

  const validation = validateEnrichRequest(body);
  if (!validation.ok) {
    return c.json({ error: validation.error }, 400);
  }

  // same-zone subrequest のベース URL = 受信 origin(本番 = https://shirabe.dev)。
  const baseUrl = new URL(c.req.url).origin;

  const { status, body: responseBody } = await runEnrich(validation.record, validation.fields, {
    baseUrl,
  });

  return c.json(responseBody, status);
});
