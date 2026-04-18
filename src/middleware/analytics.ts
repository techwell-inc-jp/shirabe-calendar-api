/**
 * S1 計測基盤: Analytics Engine 記録ミドルウェア
 *
 * 全ルートのレスポンス後に1req=1書込で Analytics Engine に記録する。
 * AE書込失敗時はレスポンスに影響させない(try-catchで握りつぶし、console.errorのみ)。
 *
 * 記録スキーマ(writeDataPoint):
 *   blobs(順序固定):
 *     0: UA category           ai/human/bot
 *     1: AI vendor             openai/anthropic/perplexity/...
 *     2: Referrer type         ai_search/other
 *     3: Referrer vendor       perplexity/chatgpt/claude/... or none
 *     4: Endpoint kind         api_call/openapi_view/docs_view/health/...
 *     5: Normalized pathname
 *     6: Plan                  free/starter/pro/enterprise/anonymous
 *     7: API key hash          16文字hex または "none"
 *     8: Tool hint             gpts/langchain/dify/llamaindex/none
 *   doubles:
 *     0: HTTP status
 *     1: Success flag          (2xxなら1、それ以外0)
 *   indexes: [endpoint_kind]
 *
 * PII配慮: 生APIキー・メール・IP・Stripe顧客IDは AE に書かない。
 */
import type { Context, Next } from "hono";
import type { AppEnv, AnalyticsEngineDataset } from "../types/env.js";
import {
  categorizeUserAgent,
  detectAIVendor,
  categorizeReferrer,
  detectReferrerVendor,
  categorizeEndpoint,
  normalizePath,
  detectToolHint,
} from "../analytics/classifier.js";

/** 有効なプラン値(それ以外は anonymous にフォールバック) */
const VALID_PLANS = new Set(["free", "starter", "pro", "enterprise"]);

/**
 * 計測ミドルウェア。
 *
 * レート制限・認証より後(context確定後)に実行する前提だが、
 * どのタイミングで呼ばれても破綻しないよう全処理を try-catch で保護する。
 */
export async function analyticsMiddleware(c: Context<AppEnv>, next: Next) {
  // まず後続処理を必ず実行(計測が何か失敗してもレスポンスには影響させない)
  await next();

  try {
    const dataset = c.env.ANALYTICS;
    if (!dataset || typeof dataset.writeDataPoint !== "function") {
      // バインディング未設定(ローカル開発等)は記録スキップ
      return;
    }
    recordDataPoint(c, dataset);
  } catch (err) {
    // 計測失敗はユーザーに影響させない。console.error のみ。
    console.error("[analytics] writeDataPoint failed", err);
  }
}

/**
 * リクエスト/レスポンスから分類済みデータポイントを組み立てて記録する。
 *
 * 例外は呼出側(ミドルウェア)の try-catch で捕捉される。
 */
function recordDataPoint(c: Context<AppEnv>, dataset: AnalyticsEngineDataset): void {
  const ua = c.req.header("User-Agent") ?? null;
  const referrer = c.req.header("Referer") ?? c.req.header("Referrer") ?? null;
  const xSource = c.req.header("X-Source") ?? null;
  const xClient = c.req.header("X-Client") ?? null;

  const url = new URL(c.req.url);
  const pathNormalized = normalizePath(url.pathname);

  const uaCategory = categorizeUserAgent(ua);
  const aiVendor = detectAIVendor(ua);
  const refType = categorizeReferrer(referrer);
  const refVendor = detectReferrerVendor(referrer);
  const endpointKind = categorizeEndpoint(pathNormalized);
  const toolHint = detectToolHint({ userAgent: ua, xSource, xClient });

  // auth ミドルウェア通過後は plan/apiKeyIdHash が c.set されている。
  // 通過していないルート(/health 等)は未定義 → anonymous 扱い。
  const rawPlan = c.get("plan");
  const plan = typeof rawPlan === "string" && VALID_PLANS.has(rawPlan) ? rawPlan : "anonymous";
  const rawIdHash = c.get("apiKeyIdHash");
  const apiKeyIdHash =
    typeof rawIdHash === "string" && rawIdHash.length > 0 ? rawIdHash : "none";

  const status = c.res.status;
  const success = status >= 200 && status < 300 ? 1 : 0;

  dataset.writeDataPoint({
    blobs: [
      uaCategory,
      aiVendor,
      refType,
      refVendor,
      endpointKind,
      pathNormalized,
      plan,
      apiKeyIdHash,
      toolHint,
    ],
    doubles: [status, success],
    indexes: [endpointKind],
  });
}
