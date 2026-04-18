/**
 * Shirabe Calendar API — Honoエントリポイント
 *
 * Cloudflare Workers上で動作するREST API + MCPサーバー
 *
 * ミドルウェア適用順:
 * 1. CORS（全エンドポイント）
 * 2. /health はミドルウェアスキップ
 * 3. /mcp はMCPサーバー（認証なし — MCP側で認証を行う場合は別途追加）
 * 4. auth → usage-check → rate-limit → usage-logger の順で /api/* に適用
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./types/env.js";
import { authMiddleware } from "./middleware/auth.js";
import { usageCheckMiddleware } from "./middleware/usage-check.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { usageLoggerMiddleware } from "./middleware/usage-logger.js";
import { analyticsMiddleware } from "./middleware/analytics.js";
import { calendar } from "./routes/calendar.js";
import { health } from "./routes/health.js";
import { internalStats } from "./routes/internal-stats.js";
import { createMcpServer } from "./mcp/server.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { renderTopPage } from "./pages/top.js";
import { renderTermsPage } from "./pages/terms.js";
import { renderPrivacyPage } from "./pages/privacy.js";
import { renderLegalPage } from "./pages/legal.js";
import { renderUpgradePage } from "./pages/upgrade.js";
import { renderCheckoutSuccessPage, resolveApiKeyFromSession } from "./pages/checkout-success.js";
import { renderCheckoutCancelPage } from "./pages/checkout-cancel.js";
import { checkout } from "./routes/checkout.js";
import { webhook } from "./routes/webhook.js";
// OpenAPI 仕様。wrangler.toml の `[[rules]] type = "Text"` により
// バンドル時に文字列としてインポートされる。
import openapiYaml from "../docs/openapi.yaml";

const app = new Hono<AppEnv>();

// CORS設定（APIサーバーのため制限なし）
app.use("*", cors());

// S1 計測: 全ルートのレスポンス後にAE書込。失敗してもレスポンスに影響させない。
// 他ミドルウェア(auth等)の c.set() を await next() 後に読むため、
// CORS の直後・個別ルートより前に登録する。
app.use("*", analyticsMiddleware);

// 静的ページ（認証不要）
app.get("/", (c) => c.html(renderTopPage()));
app.get("/terms", (c) => c.html(renderTermsPage()));
app.get("/privacy", (c) => c.html(renderPrivacyPage()));
app.get("/legal", (c) => c.html(renderLegalPage()));

// 決済導線（認証不要）
app.get("/upgrade", (c) => c.html(renderUpgradePage()));
app.get("/checkout/success", async (c) => {
  const sessionId = c.req.query("session_id");
  const keyResult = await resolveApiKeyFromSession(
    sessionId,
    c.env.STRIPE_SECRET_KEY,
    c.env.USAGE_LOGS
  );
  return c.html(renderCheckoutSuccessPage(sessionId, keyResult));
});
app.get("/checkout/cancel", (c) => c.html(renderCheckoutCancelPage()));

// /health はミドルウェアをスキップ
app.route("/health", health);

// S1 計測: /internal/stats (Basic認証)
// 認証はエンドポイント内部で処理するため、/api/* 系ミドルウェアは通さない。
app.route("/internal", internalStats);

// OpenAPI 仕様配信（認証不要、/api/* ミドルウェア適用範囲外）
app.get("/openapi.yaml", (c) => {
  return c.body(openapiYaml, 200, {
    "Content-Type": "text/yaml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
});

// MCP Streamable HTTP エンドポイント
// セッション管理付きのステートフルモード
const mcpTransports = new Map<string, WebStandardStreamableHTTPServerTransport>();

app.all("/mcp", async (c) => {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (sessionId) => {
      mcpTransports.set(sessionId, transport);
    },
    onsessionclosed: (sessionId) => {
      mcpTransports.delete(sessionId);
    },
  });

  // セッションIDがリクエストに含まれている場合、既存のトランスポートを使う
  const sessionId = c.req.header("mcp-session-id");
  if (sessionId && mcpTransports.has(sessionId)) {
    const existingTransport = mcpTransports.get(sessionId)!;
    return existingTransport.handleRequest(c.req.raw);
  }

  // 新規セッション: MCPサーバーを接続
  const mcpServer = createMcpServer();
  await mcpServer.connect(transport);

  return transport.handleRequest(c.req.raw);
});

// Checkout（認証ミドルウェアをバイパス — 未登録ユーザーが使うため）
app.route("/api/v1/checkout", checkout);

// Stripe Webhook（認証バイパス — Stripe署名検証のみ）
app.route("/webhook/stripe", webhook);

// API エンドポイントにミドルウェアを適用
// 順序: auth → usage-check → rate-limit → usage-logger → route handler
app.use("/api/*", authMiddleware);
app.use("/api/*", usageCheckMiddleware);
app.use("/api/*", rateLimitMiddleware);
app.use("/api/*", usageLoggerMiddleware);

// APIルーティング
app.route("/api/v1/calendar", calendar);

// 404
app.notFound((c) => {
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "The requested endpoint does not exist",
      },
    },
    404
  );
});

// グローバルエラーハンドラー
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again.",
      },
    },
    500
  );
});

export default app;
