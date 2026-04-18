/**
 * S1 計測基盤: 分類ロジックの単体テスト
 *
 * shirabe_project_guideline_v1.02.md 第8章・付録C に準拠した分類を
 * 網羅的に検証する。
 */
import { describe, it, expect } from "vitest";
import {
  categorizeUserAgent,
  detectAIVendor,
  categorizeReferrer,
  detectReferrerVendor,
  categorizeEndpoint,
  normalizePath,
  detectToolHint,
} from "../../src/analytics/classifier.js";

// ---------------------------------------------------------------------------
// categorizeUserAgent / detectAIVendor
// ---------------------------------------------------------------------------

describe("categorizeUserAgent / detectAIVendor", () => {
  const aiSamples: Array<{ ua: string; vendor: string }> = [
    { ua: "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)", vendor: "openai" },
    { ua: "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)", vendor: "openai" },
    { ua: "Claude-Web/1.0", vendor: "anthropic" },
    { ua: "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", vendor: "anthropic" },
    { ua: "anthropic-ai/0.1", vendor: "anthropic" },
    { ua: "Mozilla/5.0 PerplexityBot/1.0", vendor: "perplexity" },
    { ua: "Mozilla/5.0 (compatible) Google-Extended", vendor: "google" },
    { ua: "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)", vendor: "bytedance" },
    { ua: "cohere-ai/1.0", vendor: "cohere" },
    { ua: "facebookexternalhit/1.1 FacebookBot", vendor: "meta" },
    { ua: "Mozilla/5.0 (compatible; Diffbot/0.1; +http://www.diffbot.com)", vendor: "diffbot" },
    { ua: "Applebot-Extended/1.0", vendor: "apple" },
  ];

  it("AIクローラーUAの主要12種が全て ai として分類される", () => {
    for (const sample of aiSamples) {
      expect(categorizeUserAgent(sample.ua)).toBe("ai");
    }
  });

  it("AIクローラーUAの主要12種で正しいvendorが返る", () => {
    for (const sample of aiSamples) {
      expect(detectAIVendor(sample.ua)).toBe(sample.vendor);
    }
  });

  it("Googlebot(非Google-Extended)は bot として分類される", () => {
    const ua = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
    expect(categorizeUserAgent(ua)).toBe("bot");
    expect(detectAIVendor(ua)).toBe("none");
  });

  it("Bingbot は bot / vendor:none", () => {
    const ua = "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";
    expect(categorizeUserAgent(ua)).toBe("bot");
    expect(detectAIVendor(ua)).toBe("none");
  });

  it("通常ブラウザUAは human", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    expect(categorizeUserAgent(ua)).toBe("human");
    expect(detectAIVendor(ua)).toBe("none");
  });

  it("null UAは human / vendor:none", () => {
    expect(categorizeUserAgent(null)).toBe("human");
    expect(detectAIVendor(null)).toBe("none");
  });

  it("空文字UAは human / vendor:none", () => {
    expect(categorizeUserAgent("")).toBe("human");
    expect(detectAIVendor("")).toBe("none");
  });

  it("curl は human 扱い(AIクローラー判定・汎用bot判定を通らない)", () => {
    // `curl` は人間オペレータが叩く想定。bot トークンを含まないため human。
    const ua = "curl/8.0.0";
    expect(categorizeUserAgent(ua)).toBe("human");
  });
});

// ---------------------------------------------------------------------------
// categorizeReferrer / detectReferrerVendor
// ---------------------------------------------------------------------------

describe("categorizeReferrer / detectReferrerVendor", () => {
  const aiRefs: Array<{ url: string; vendor: string }> = [
    { url: "https://www.perplexity.ai/search?q=shirabe", vendor: "perplexity" },
    { url: "https://felo.ai/search", vendor: "felo" },
    { url: "https://you.com/search", vendor: "you" },
    { url: "https://www.phind.com/search", vendor: "phind" },
    { url: "https://chat.openai.com/c/abc", vendor: "chatgpt" },
    { url: "https://chatgpt.com/g/g-abc", vendor: "chatgpt" },
    { url: "https://claude.ai/chat/xyz", vendor: "claude" },
    { url: "https://gemini.google.com/", vendor: "gemini" },
    { url: "https://copilot.microsoft.com/", vendor: "copilot" },
  ];

  it("AI検索リファラの主要9種が ai_search として分類される", () => {
    for (const sample of aiRefs) {
      expect(categorizeReferrer(sample.url)).toBe("ai_search");
      expect(detectReferrerVendor(sample.url)).toBe(sample.vendor);
    }
  });

  it("通常検索エンジン(Google SERP)は other / vendor:none", () => {
    expect(categorizeReferrer("https://www.google.com/search?q=shirabe")).toBe("other");
    expect(detectReferrerVendor("https://www.google.com/search?q=shirabe")).toBe("none");
  });

  it("不正URLは other / vendor:none", () => {
    expect(categorizeReferrer("not-a-valid-url")).toBe("other");
    expect(detectReferrerVendor("not-a-valid-url")).toBe("none");
  });

  it("null Referrerは other / vendor:none", () => {
    expect(categorizeReferrer(null)).toBe("other");
    expect(detectReferrerVendor(null)).toBe("none");
  });

  it("空文字Referrerは other / vendor:none", () => {
    expect(categorizeReferrer("")).toBe("other");
    expect(detectReferrerVendor("")).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// categorizeEndpoint
// ---------------------------------------------------------------------------

describe("categorizeEndpoint", () => {
  it("/api/v1/calendar/:date は api_call", () => {
    expect(categorizeEndpoint("/api/v1/calendar/:date")).toBe("api_call");
  });

  it("/openapi.yaml は openapi_view", () => {
    expect(categorizeEndpoint("/openapi.yaml")).toBe("openapi_view");
  });

  it("/health は health", () => {
    expect(categorizeEndpoint("/health")).toBe("health");
  });

  it("/webhook/stripe は webhook", () => {
    expect(categorizeEndpoint("/webhook/stripe")).toBe("webhook");
  });

  it("/checkout/success は checkout", () => {
    expect(categorizeEndpoint("/checkout/success")).toBe("checkout");
  });

  it("/api/v1/checkout は checkout", () => {
    expect(categorizeEndpoint("/api/v1/checkout")).toBe("checkout");
  });

  it("/internal/stats は internal", () => {
    expect(categorizeEndpoint("/internal/stats")).toBe("internal");
  });

  it("/mcp は mcp", () => {
    expect(categorizeEndpoint("/mcp")).toBe("mcp");
  });

  it("静的ページ(/、/terms、/privacy、/legal、/upgrade)は docs_view", () => {
    expect(categorizeEndpoint("/")).toBe("docs_view");
    expect(categorizeEndpoint("/terms")).toBe("docs_view");
    expect(categorizeEndpoint("/privacy")).toBe("docs_view");
    expect(categorizeEndpoint("/legal")).toBe("docs_view");
    expect(categorizeEndpoint("/upgrade")).toBe("docs_view");
  });

  it("未定義ルートは other", () => {
    expect(categorizeEndpoint("/some/unknown")).toBe("other");
  });
});

// ---------------------------------------------------------------------------
// normalizePath
// ---------------------------------------------------------------------------

describe("normalizePath", () => {
  it("日付セグメント(YYYY-MM-DD)を :date に正規化する", () => {
    expect(normalizePath("/api/v1/calendar/2026-04-18")).toBe("/api/v1/calendar/:date");
  });

  it("32文字以上の16進IDを :id に正規化する", () => {
    expect(
      normalizePath("/api/v1/session/deadbeefcafebabedeadbeefcafebabedeadbeefcafebabedeadbeefcafebabe")
    ).toBe("/api/v1/session/:id");
  });

  it("Stripe Checkout Session IDを :id に正規化する", () => {
    expect(normalizePath("/checkout/success/cs_live_abcDEF123")).toBe("/checkout/success/:id");
  });

  it("UUIDを :id に正規化する", () => {
    expect(normalizePath("/mcp/550e8400-e29b-41d4-a716-446655440000")).toBe("/mcp/:id");
  });

  it("純粋な数値IDを :id に正規化する", () => {
    expect(normalizePath("/v1/items/12345")).toBe("/v1/items/:id");
  });

  it("クエリ文字列を除去する", () => {
    expect(normalizePath("/openapi.yaml?v=1")).toBe("/openapi.yaml");
  });

  it("フラグメントを除去する", () => {
    expect(normalizePath("/upgrade#plans")).toBe("/upgrade");
  });

  it("末尾スラッシュを除去する(ルート / は保持)", () => {
    expect(normalizePath("/health/")).toBe("/health");
    expect(normalizePath("/")).toBe("/");
  });

  it("空文字は / に正規化する", () => {
    expect(normalizePath("")).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// detectToolHint
// ---------------------------------------------------------------------------

describe("detectToolHint", () => {
  it("X-Source: gpts は gpts", () => {
    expect(detectToolHint({ userAgent: "any", xSource: "gpts", xClient: null })).toBe("gpts");
  });

  it("X-Client: langchain は langchain", () => {
    expect(detectToolHint({ userAgent: "any", xSource: null, xClient: "langchain" })).toBe(
      "langchain"
    );
  });

  it("X-Source: dify は dify", () => {
    expect(detectToolHint({ userAgent: "any", xSource: "dify", xClient: null })).toBe("dify");
  });

  it("X-Source: llamaindex は llamaindex", () => {
    expect(detectToolHint({ userAgent: "any", xSource: "llamaindex", xClient: null })).toBe(
      "llamaindex"
    );
  });

  it("UAに langchain を含めば langchain", () => {
    expect(detectToolHint({ userAgent: "LangChain/0.1 Python", xSource: null, xClient: null })).toBe(
      "langchain"
    );
  });

  it("UAに ChatGPT-User を含めば gpts", () => {
    expect(
      detectToolHint({ userAgent: "Mozilla/5.0 ChatGPT-User/1.0", xSource: null, xClient: null })
    ).toBe("gpts");
  });

  it("該当なしは none", () => {
    expect(
      detectToolHint({
        userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120",
        xSource: null,
        xClient: null,
      })
    ).toBe("none");
  });

  it("全ヘッダーnull/undefinedは none", () => {
    expect(detectToolHint({ userAgent: null, xSource: null, xClient: null })).toBe("none");
  });
});
