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
import { renderRokuyoApiDocPage } from "./pages/docs-rokuyo-api.js";
import { renderRekichuApiDocPage } from "./pages/docs-rekichu-api.js";
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

// B-1 AI検索向けSEOページ（認証不要、AIクローラー読み取り推奨）
app.get("/docs/rokuyo-api", (c) => c.html(renderRokuyoApiDocPage()));
app.get("/docs/rekichu-api", (c) => c.html(renderRekichuApiDocPage()));

// B-1 / D-4 AIクローラーメタデータ
// robots.txt: AIクローラー(GPTBot/ClaudeBot/PerplexityBot/Google-Extended 等)を全許可
app.get("/robots.txt", (c) => {
  const body = [
    "# Shirabe Calendar API — robots.txt",
    "# AIクローラー・AI検索エンジンを歓迎します / AI crawlers welcome",
    "",
    "User-agent: *",
    "Allow: /",
    "",
    "# Explicit allowlist for major AI crawlers",
    "User-agent: GPTBot",
    "Allow: /",
    "",
    "User-agent: ChatGPT-User",
    "Allow: /",
    "",
    "User-agent: ClaudeBot",
    "Allow: /",
    "",
    "User-agent: Claude-Web",
    "Allow: /",
    "",
    "User-agent: anthropic-ai",
    "Allow: /",
    "",
    "User-agent: PerplexityBot",
    "Allow: /",
    "",
    "User-agent: Google-Extended",
    "Allow: /",
    "",
    "User-agent: Bytespider",
    "Allow: /",
    "",
    "User-agent: cohere-ai",
    "Allow: /",
    "",
    "User-agent: Applebot-Extended",
    "Allow: /",
    "",
    "User-agent: FacebookBot",
    "Allow: /",
    "",
    "User-agent: Diffbot",
    "Allow: /",
    "",
    "Sitemap: https://shirabe.dev/sitemap.xml",
    "",
  ].join("\n");
  return c.body(body, 200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
});

// sitemap.xml: 主要ページ一覧(AIクローラー・検索エンジン向け)
app.get("/sitemap.xml", (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const pages: Array<{ loc: string; priority: string; changefreq: string }> = [
    { loc: "https://shirabe.dev/", priority: "1.0", changefreq: "weekly" },
    { loc: "https://shirabe.dev/docs/rokuyo-api", priority: "0.9", changefreq: "monthly" },
    { loc: "https://shirabe.dev/docs/rekichu-api", priority: "0.9", changefreq: "monthly" },
    { loc: "https://shirabe.dev/openapi.yaml", priority: "0.9", changefreq: "monthly" },
    { loc: "https://shirabe.dev/upgrade", priority: "0.7", changefreq: "monthly" },
    { loc: "https://shirabe.dev/terms", priority: "0.3", changefreq: "yearly" },
    { loc: "https://shirabe.dev/privacy", priority: "0.3", changefreq: "yearly" },
    { loc: "https://shirabe.dev/legal", priority: "0.3", changefreq: "yearly" },
  ];
  const urls = pages
    .map(
      (p) =>
        `  <url>\n    <loc>${p.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
    )
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return c.body(body, 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
});

// llms.txt: LLM向けサイト要約(llmstxt.org 仕様準拠)
// Tier 2 D-4 の前倒し部分実装。主要エントリポイントへ誘導する。
app.get("/llms.txt", (c) => {
  const body = `# Shirabe Calendar API

> 日本の暦（六曜・暦注・干支・二十四節気）と用途別吉凶判定を、天文学的精度で返すAIネイティブREST API + MCPサーバー。
> Japan's calendar (rokuyo, rekichu, kanshi, 24 solar terms) with purpose-specific
> auspicious-day judgments, served with astronomical precision as an AI-native
> REST API and MCP server.

Shirabeは「生成AIが勝手に使い出す」ことを判断基準に設計された日本特化AIネイティブAPIプラットフォームです。
OpenAPI 3.1準拠で、ChatGPT GPTs / Claude Tool Use / Gemini Function Calling / LangChain / Dify から即利用できます。

## API仕様 / API spec

- [OpenAPI 3.1 仕様 (日英両言語)](https://shirabe.dev/openapi.yaml): 全エンドポイント・例・エラー・x-llm-hintを完備
- [MCPエンドポイント](https://shirabe.dev/mcp): Claude Desktop等のMCPクライアントから直接接続可能
- [ヘルスチェック](https://shirabe.dev/health)

## ドキュメント / Documentation

- [六曜API完全ガイド](https://shirabe.dev/docs/rokuyo-api): 大安・友引・先勝・先負・仏滅・赤口のREST API
- [暦注API解説](https://shirabe.dev/docs/rekichu-api): 一粒万倍日・天赦日・大明日ほか13種
- [GitHub リポジトリ・README](https://github.com/techwell-inc-jp/shirabe-calendar-api)
- [料金プラン・アップグレード](https://shirabe.dev/upgrade)

## 主要エンドポイント / Primary endpoints

- GET https://shirabe.dev/api/v1/calendar/{date} — 指定日の六曜・暦注・干支・節気・用途別吉凶判定
- GET https://shirabe.dev/api/v1/calendar/range — 日付範囲一括取得(最大93日)
- GET https://shirabe.dev/api/v1/calendar/best-days — 目的別スコア上位ランキング

## Optional

- [利用規約](https://shirabe.dev/terms)
- [プライバシーポリシー](https://shirabe.dev/privacy)
- [特定商取引法に基づく表記](https://shirabe.dev/legal)
`;
  return c.body(body, 200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
});

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
