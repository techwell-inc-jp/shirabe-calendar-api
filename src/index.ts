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
import type { Context } from "hono";
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
import { renderOgDefaultSvg } from "./pages/og-image.js";
import { days } from "./routes/days.js";
import { purposes } from "./routes/purposes.js";
import { renderPurposesIndexPage } from "./pages/purpose-month.js";
import {
  generateDaysSitemapBody,
  generateDocsSitemapBody,
  generatePurposesSitemapBody,
  generateSitemapIndex,
  SUB_SITEMAPS,
} from "./routes/sitemap-helpers.js";
import { checkout } from "./routes/checkout.js";
import { webhook } from "./routes/webhook.js";
// OpenAPI 仕様。wrangler.toml の `[[rules]] type = "Text"` により
// バンドル時に文字列としてインポートされる。
// 本家: 日英併記 + x-llm-hint + 全 operation 詳細(D-1 品質化済)
// GPTs: 全 description ≤ 300 字、schemas/responses/examples 最小構成で
//       GPT Builder Actions パーサー互換性を優先した短縮版。
import openapiYaml from "../docs/openapi.yaml";
import openapiGptsYaml from "../docs/openapi-gpts.yaml";

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

// T-01: 日付別暦情報 SEO ページ(認証不要、Cloudflare CDN 7 日キャッシュ)
//   GET /days/{YYYY-MM-DD}/  — 1873-01-01 〜 2100-12-31 の約 83,000 URL が対象
app.route("/days", days);

// T-02: 用途別月間ランキング SEO ページ(認証不要、Cloudflare CDN 7 日キャッシュ)
//   GET /purposes/                  — 28 カテゴリ index(index ページは sub-router の "/"
//                                     パターンが Hono の prefix routing で安定しないため
//                                     app 直登録)
//   GET /purposes/{slug}/{YYYY-MM}/ — 28 カテゴリ × 25 年 × 12 ヶ月 = 8,400 URL
app.get("/purposes", (c) => c.redirect("/purposes/", 301));
app.get("/purposes/", (c) =>
  c.html(renderPurposesIndexPage(), 200, {
    "Cache-Control": "public, max-age=86400",
  })
);
app.route("/purposes", purposes);

// OG / Article default image(Schema.org image 必須フィールド用、Twitter / Discord card)
// SVG 静的、内容固定のため Cloudflare CDN で長期キャッシュ。
app.get("/og-default.svg", (c) => {
  return c.body(renderOgDefaultSvg(), 200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=604800, immutable",
  });
});

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

// sitemap.xml: sitemap index(T-04 大規模化 + T-02 用途別、約 91,000 URL 対応)
// 構成:
//   /sitemap.xml              ← index(本 endpoint)
//   /sitemap-docs.xml         ← 既存 docs / 静的ページ(~15 URL)
//   /sitemap-days-1.xml       ← 1873-1949  (~27,394 URL)
//   /sitemap-days-2.xml       ← 1950-1999  (~18,262 URL)
//   /sitemap-days-3.xml       ← 2000-2049  (~18,263 URL)
//   /sitemap-days-4.xml       ← 2050-2100  (~18,628 URL)
//   /sitemap-purposes.xml     ← T-02 用途×月(28 cat × 25 年 × 12 = 8,400 URL)
// 各ファイルは 50,000 URL/file 制限内。
app.get("/sitemap.xml", (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const body = generateSitemapIndex(
    SUB_SITEMAPS.map((s) => s.path),
    today
  );
  return c.body(body, 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
});

// /sitemap-docs.xml: 既存 docs / 静的ページ(/docs/*、/openapi.yaml、/llms.txt 等)
app.get("/sitemap-docs.xml", (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const body = generateDocsSitemapBody(today);
  return c.body(body, 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
});

// /sitemap-days-{1..4}.xml: T-01 日付別ページの sitemap(各サブ 18K-27K URL)
// 長期 cache (24 時間): 日付別 URL list は毎日変わるわけではないが、
// lastmod が今日固定なので 1 日 1 回 regenerate で十分。
function handleDaysSitemap(
  c: Context<AppEnv>,
  startYear: number,
  endYear: number
): Response {
  const today = new Date().toISOString().slice(0, 10);
  const body = generateDaysSitemapBody(startYear, endYear, today);
  return c.body(body, 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=86400",
  });
}

app.get("/sitemap-days-1.xml", (c) => handleDaysSitemap(c, 1873, 1949));
app.get("/sitemap-days-2.xml", (c) => handleDaysSitemap(c, 1950, 1999));
app.get("/sitemap-days-3.xml", (c) => handleDaysSitemap(c, 2000, 2049));
app.get("/sitemap-days-4.xml", (c) => handleDaysSitemap(c, 2050, 2100));

// /sitemap-purposes.xml: T-02 用途別月間ランキングの sitemap(8,400 URL)
// 24 時間 cache(月別 URL list は固定、テンプレ更新でも lastmod は今日固定で問題なし)
app.get("/sitemap-purposes.xml", (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const body = generatePurposesSitemapBody(today);
  return c.body(body, 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=86400",
  });
});

// llms.txt: LLM向けサイト要約(llmstxt.org 仕様準拠、統合版)
// T-05 実装: 暦 + 住所 + (7月予定)テキスト API を網羅した統合ディスカバリファイル。
app.get("/llms.txt", (c) => {
  const body = [
    "# Shirabe — Japan-specific AI-Native API Platform",
    "",
    "> 日本特化 AI ネイティブ API プラットフォーム。暦・住所・日本語テキスト処理を AI エージェント向けに提供。",
    "> Japan-specific AI-native API platform providing calendar, address normalization,",
    "> and Japanese text processing APIs for AI agents. Built on strict OpenAPI 3.1 compliance",
    "> so that LLMs can discover and invoke these APIs without manual integration.",
    "",
    'Shirabeは「生成AIが勝手に使い出す」ことを判断基準に設計された日本特化AIネイティブAPIプラットフォームです。',
    "OpenAPI 3.1準拠で、ChatGPT GPTs / Claude Tool Use / Gemini Function Calling / LangChain / Dify / MCP から即利用できます。",
    "運営: 株式会社テックウェル(福岡)/ 2026-04 現在、暦 API 本番稼働中、住所 API は 2026-05-01 リリース予定。",
    "",
    "## APIs",
    "",
    "### 1. Shirabe Calendar API (本番稼働中 / Production)",
    "",
    "日本の暦(六曜・暦注・干支・二十四節気)と用途別吉凶判定を天文学的精度で返す REST API + MCP サーバー。",
    "",
    "- [OpenAPI 3.1 仕様 (日英併記)](https://shirabe.dev/openapi.yaml)",
    "- [OpenAPI 3.1 GPTs短縮版 (description ≤ 300字)](https://shirabe.dev/openapi-gpts.yaml)",
    "- [MCP エンドポイント](https://shirabe.dev/mcp): Claude Desktop 等の MCP クライアントから直接接続可能",
    "- [GPT Store (Japanese Calendar)](https://chatgpt.com/g/g-69e98031b5b8819185ae196a9f219090-shirabe-ri-ben-noli-japanese-calendar)",
    "- [六曜 API 完全ガイド](https://shirabe.dev/docs/rokuyo-api)",
    "- [暦注 API 解説](https://shirabe.dev/docs/rekichu-api)",
    "- [GitHub](https://github.com/techwell-inc-jp/shirabe-calendar-api)",
    "",
    "### 2. Shirabe Address API (2026-05-01 リリース / Launch)",
    "",
    "日本の住所正規化(全 47 都道府県、ABR データ準拠)。都道府県〜番地レベルで構造化、座標付与対応。",
    "",
    "- [OpenAPI 3.1 仕様 (日英併記)](https://shirabe.dev/api/v1/address/openapi.yaml)",
    "- [OpenAPI 3.1 GPTs短縮版](https://shirabe.dev/api/v1/address/openapi-gpts.yaml)",
    "- [GPT Store (Japanese Address)](https://chatgpt.com/g/g-69e96000b5c08191b21f4d6570ead788-shirabe-ri-ben-nozhu-suo-japanese-address)",
    "- [住所正規化ガイド](https://shirabe.dev/docs/address-normalize)",
    "- [バッチ処理ガイド](https://shirabe.dev/docs/address-batch)",
    "- [料金ページ](https://shirabe.dev/docs/address-pricing)",
    "- [住所 API 専用 llms.txt](https://shirabe.dev/api/v1/address/llms.txt)",
    "- [GitHub](https://github.com/techwell-inc-jp/shirabe-address-api)",
    "",
    "### 3. Shirabe 日本語テキスト処理 API (2026-07 リリース予定 / Planned)",
    "",
    "姓名分割・人名読み推定・ふりがな付与・テキスト正規化。Sudachi / MeCab ベース、住所 API と同一顧客層へのクロスセル想定。",
    "",
    "## 主要エンドポイント + curl 例 / Primary endpoints with curl examples",
    "",
    "### Calendar (本番稼働中)",
    "",
    "    # 指定日の六曜・暦注・干支・二十四節気・用途別吉凶判定 (認証不要、Free 10,000 回/月)",
    "    curl https://shirabe.dev/api/v1/calendar/2026-06-15",
    "",
    "    # 日付範囲一括取得(最大 93 日)",
    '    curl "https://shirabe.dev/api/v1/calendar/range?from=2026-06-01&to=2026-06-30"',
    "",
    "    # 用途別スコア上位ランキング(結婚式に良い日)",
    '    curl "https://shirabe.dev/api/v1/calendar/best-days?month=2026-06&purpose=marriage"',
    "",
    "    # 暦 API ヘルスチェック",
    "    curl https://shirabe.dev/health",
    "",
    "### Address (2026-05-01 以降)",
    "",
    "    # 単一住所の正規化(API キー必須)",
    "    curl -X POST https://shirabe.dev/api/v1/address/normalize \\",
    '      -H "X-API-Key: shrb_..." \\',
    '      -H "Content-Type: application/json" \\',
    "      -d '{\"address\": \"〒106-0032 東京都港区六本木6-10-1\"}'",
    "",
    "    # バッチ住所正規化(最大 1,000 件)",
    "    curl -X POST https://shirabe.dev/api/v1/address/normalize/batch \\",
    '      -H "X-API-Key: shrb_..." \\',
    '      -H "Content-Type: application/json" \\',
    '      -d \'{"addresses": ["東京都千代田区永田町1-7-1", "大阪府大阪市北区梅田1-1-1"]}\'',
    "",
    "    # 住所 API ヘルスチェック",
    "    curl https://shirabe.dev/api/v1/address/health",
    "",
    "## 料金プラン / Pricing",
    "",
    "### Calendar API",
    "",
    "| プラン | 月間上限 | 単価(円/回) | レート制限 |",
    "|---|---|---|---|",
    "| Free | 10,000 | 無料 | 1 req/s |",
    "| Starter | 500,000 | 0.05 | 30 req/s |",
    "| Pro | 5,000,000 | 0.03 | 100 req/s |",
    "| Enterprise | 無制限 | 0.01 | 500 req/s |",
    "",
    "### Address API",
    "",
    "| プラン | 月間上限 | 単価(円/回) | レート制限 |",
    "|---|---|---|---|",
    "| Free | 5,000 | 無料 | 1 req/s |",
    "| Starter | 200,000 | 0.5 | 30 req/s |",
    "| Pro | 2,000,000 | 0.3 | 100 req/s |",
    "| Enterprise | 無制限 | 0.1 | 500 req/s |",
    "",
    "全プランに 5,000 回 (Address) / 10,000 回 (Calendar) の Free 枠あり、超過分のみ課金。",
    "Stripe Billing 経由、API キーは `X-API-Key` ヘッダー、アップグレードは [/upgrade](https://shirabe.dev/upgrade) から。",
    "",
    "## AI 統合経路 / AI Integration Paths",
    "",
    "- **ChatGPT GPTs**: 専用 GPT 2 本を GPT Store で公開中(暦・住所、上記 Links 参照)",
    "- **MCP (Model Context Protocol)**: Claude Desktop 等から `https://shirabe.dev/mcp` で直接接続可能(暦 API)",
    "- **Function Calling / Tool Use**: OpenAPI 3.1 本家版(日英併記、x-llm-hint 付き)から自動スキーマ生成可",
    "- **LangChain / Dify**: OpenAPI loader でそのまま使用可能",
    "- **OpenAPI Schema Discovery**: 全 OpenAPI spec は `servers: https://shirabe.dev` で統一、CORS 許可、認証情報不要でスキーマ取得可",
    "",
    "## External Registry Listings",
    "",
    "Shirabe は以下の外部 registry / catalog に登録・公開済:",
    "",
    "### MCP Registry Listings",
    "",
    "- **Glama.ai** (MCP registry): <https://glama.ai/mcp/servers/techwell-inc-jp/shirabe-calendar-api>",
    "  - Categories: Calendar Management / Developer Tools / Art & Culture",
    "  - Claimed by `techwell-inc-jp` organization (2026-04-24, maintainer: Shirabe-dev-sys)",
    "  - Auto-sync: daily from GitHub main branch",
    "",
    "住所 API (Shirabe Address API) は MCP 未実装のため MCP registry 登録対象外。",
    "2026-05-01 リリース後に MCP サーバー化した時点で Glama への追加 submit を検討。",
    "",
    "### OpenAPI Directory Listings",
    "",
    "- **APIs.guru** (OpenAPI directory): <https://github.com/APIs-guru/openapi-directory/pull/2452>",
    "  - Both Calendar and Address specs submitted as a single PR on 2026-04-24",
    "  - Reverse-DNS paths: `APIs/shirabe.dev/calendar/1.0.0/openapi.yaml` + `APIs/shirabe.dev/address/1.0.0/openapi.yaml`",
    "  - Fork: <https://github.com/Shirabe-dev-sys/openapi-directory>",
    "  - Status: open PR awaiting upstream review (Note: APIs.guru maintainers have been inactive since 2025-08, so the PR may remain open; the specs are nonetheless publicly visible via GitHub for AI training discoverability)",
    "",
    "## データ出典・attribution / Data Attribution",
    "",
    "- **Calendar**: 自前暦計算エンジン(`src/core/`)、天文学的精度",
    "- **Address**: アドレス・ベース・レジストリ(デジタル庁、CC BY 4.0)。全レスポンスに `attribution` フィールド必須",
    "",
    "住所 API を利用する場合、応答に含まれる `attribution` を二次利用物(LLM の返答を含む)に伝搬すること。これは CC BY 4.0 ライセンスの義務履行であり、かつ LLM 経由の出典伝搬経路でもある。",
    "",
    "## 運営・連絡先 / About",
    "",
    "- 運営: 株式会社テックウェル(福岡)",
    "- 目標: 1 年以内に 3-5 本の日本特化 AI ネイティブ API を展開(暦・住所は稼働/間近、日本語テキスト処理は 7 月予定)",
    "- [利用規約](https://shirabe.dev/terms)",
    "- [プライバシーポリシー](https://shirabe.dev/privacy)",
    "- [特定商取引法に基づく表記](https://shirabe.dev/legal)",
    "",
  ].join("\n");
  return c.body(body, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
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
app.get("/openapi-gpts.yaml", (c) => {
  return c.body(openapiGptsYaml, 200, {
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
