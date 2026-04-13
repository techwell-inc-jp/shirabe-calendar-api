/**
 * Shirabe Calendar API — Honoエントリポイント
 *
 * Cloudflare Workers上で動作するREST API + MCPサーバー
 *
 * ミドルウェア適用順:
 * 1. CORS（全エンドポイント）
 * 2. /health はミドルウェアスキップ
 * 3. /mcp はMCPサーバー（認証なし — MCP側で認証を行う場合は別途追加）
 * 4. auth → rate-limit → usage-logger の順で /api/* に適用
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./types/env.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { usageLoggerMiddleware } from "./middleware/usage-logger.js";
import { calendar } from "./routes/calendar.js";
import { health } from "./routes/health.js";
import { createMcpServer } from "./mcp/server.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

const app = new Hono<AppEnv>();

// CORS設定（APIサーバーのため制限なし）
app.use("*", cors());

// /health はミドルウェアをスキップ
app.route("/health", health);

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

// API エンドポイントにミドルウェアを適用
app.use("/api/*", authMiddleware);
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
