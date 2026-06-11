/**
 * Hub 複合 enrich endpoint(POST /api/v1/enrich)。
 *
 * order: shirabe-assets/implementation-orders/20260611-hub-enrich-endpoint-scoping.md
 *
 * 「B2B 4 大 identifier(住所・人名・法人番号・暦)を 1 コールで正規化」する hub の本丸。
 * 既存 endpoint の合成(calendar = in-process、address/name/corporation = same-zone subrequest)
 * で新規データソースなし。常に HTTP 200、全 component unavailable 時のみ 503。
 *
 * 認可(§3): Hub Pro/Enterprise license 専用 + 匿名体験枠 500 回/月/IP。超過・非対象は
 * 403/429 + 常に hub_pro 推奨(`enrich/access.ts`)。計測は enrich_request signal(§5)。
 *
 * ★ 登録順依存(index.ts): 本 route は /api/* 認証ミドルウェアより前に登録し、独自の
 *   quota / license gate を route 内に持つ(標準 free 枠とは別系列の enrich 専用 quota)。
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/env.js";
import { validateEnrichRequest, runEnrich } from "../enrich/enrich-service.js";
import {
  resolveEnrichAccess,
  incrementEnrichUsage,
  enrichHubProRecommendation,
} from "../enrich/access.js";
import { licenseRecommendationToJson } from "../licensing/surface.js";
import { emitEnrichRequestSignal } from "../enrich/enrich-analytics.js";
import { categorizeUserAgent, detectToolHint } from "../analytics/classifier.js";
import type { EnrichComponent, EnrichComponentResult } from "../types/enrich.js";

export const enrich = new Hono<AppEnv>();

/**
 * 複合 enrich を実行する。
 *
 * body = { record: {address?, name?, company_name?, corporate_number?, date?}, fields?: [...] }
 * fields 省略時は record に存在する入力から component を自動推定する。
 */
enrich.post("/", async (c) => {
  // 1) 認可 / quota(license gate + 匿名体験枠)。
  const access = await resolveEnrichAccess(c);
  if (!access.allow) {
    if (access.retryAfterSec !== undefined) {
      c.header("Retry-After", String(access.retryAfterSec));
    }
    let recommend: Record<string, unknown> | undefined;
    if (access.recommend) {
      const rec = enrichHubProRecommendation();
      c.header("X-Shirabe-Recommend", rec.sku);
      recommend = licenseRecommendationToJson(rec);
    }
    return c.json(
      {
        error: {
          code: access.errorCode,
          message: access.message,
          ...(recommend ? { license_recommend: recommend } : {}),
        },
      },
      access.httpStatus
    );
  }

  // 2) 入力検証。
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

  // 3) 合成(calendar=in-process、他=same-zone subrequest)。internal marker は案 X(downstream 非計上)。
  const baseUrl = new URL(c.req.url).origin;
  const { status, body: responseBody } = await runEnrich(validation.record, validation.fields, {
    baseUrl,
    internalToken: c.env.INTERNAL_ENRICH_TOKEN,
  });

  // 4) 匿名体験枠の消費を計上(処理後)。計測失敗はレスポンスに影響させない。
  if (access.authMode === "anonymous") {
    try {
      await incrementEnrichUsage(c, access.usageKey, access.current);
    } catch (err) {
      console.error("[enrich] usage increment failed", err);
    }
  }

  // 5) enrich_request signal(§5、PII 非保持)。
  emitEnrichRequestSignal(c.env.ANALYTICS, {
    componentMix: componentMix(responseBody.results),
    authMode: access.authMode,
    uaCategory: categorizeUserAgent(c.req.header("User-Agent") ?? null),
    toolHint: detectToolHint({
      userAgent: c.req.header("User-Agent") ?? null,
      xSource: c.req.header("X-Source") ?? null,
      xClient: c.req.header("X-Client") ?? null,
    }),
    componentCount: countBy(responseBody.results, (r) => r.status !== "skipped"),
    successCount: countBy(responseBody.results, (r) => r.status === "ok"),
  });

  return c.json(responseBody, status);
});

/** attempted(= 非 skipped)component を canonical 順で "+" 連結する。 */
function componentMix(results: Partial<Record<EnrichComponent, EnrichComponentResult>>): string {
  return (Object.keys(results) as EnrichComponent[])
    .filter((k) => results[k]?.status !== "skipped")
    .join("+");
}

/** 条件を満たす component 結果の数を数える。 */
function countBy(
  results: Partial<Record<EnrichComponent, EnrichComponentResult>>,
  pred: (r: EnrichComponentResult) => boolean
): number {
  return Object.values(results).filter((r): r is EnrichComponentResult => r !== undefined && pred(r))
    .length;
}
