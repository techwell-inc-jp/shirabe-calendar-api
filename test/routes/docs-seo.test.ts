/**
 * B-1 AI検索向けSEOページ + AIクローラーメタデータのルーティングテスト
 *
 * 対象:
 * - GET /docs/rokuyo-api (六曜API完全ガイド)
 * - GET /docs/rekichu-api (暦注API解説)
 * - GET /robots.txt (AIクローラー全許可)
 * - GET /sitemap.xml (主要ページ一覧)
 * - GET /llms.txt (LLM向けサイト要約)
 */
import { describe, it, expect } from "vitest";
import app from "../../src/index.js";
import { createMockEnv } from "../helpers/mock-kv.js";

async function fetchPath(path: string) {
  const env = createMockEnv();
  const res = await app.fetch(new Request(`http://localhost${path}`), env);
  const body = await res.text();
  return { res, body };
}

describe("GET /docs/rokuyo-api (B-1 SEO page)", () => {
  it("200 を返し、HTMLが返る", async () => {
    const { res, body } = await fetchPath("/docs/rokuyo-api");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<!DOCTYPE html>");
  });

  it("六曜(大安・友引・先勝・先負・仏滅・赤口)を含む", async () => {
    const { body } = await fetchPath("/docs/rokuyo-api");
    expect(body).toContain("大安");
    expect(body).toContain("友引");
    expect(body).toContain("先勝");
    expect(body).toContain("先負");
    expect(body).toContain("仏滅");
    expect(body).toContain("赤口");
  });

  it("canonical URL と OG メタタグを含む", async () => {
    const { body } = await fetchPath("/docs/rokuyo-api");
    expect(body).toContain('rel="canonical"');
    expect(body).toContain("https://shirabe.dev/docs/rokuyo-api");
    expect(body).toContain('property="og:type"');
    expect(body).toContain('property="og:title"');
    expect(body).toContain('property="og:url"');
  });

  it("JSON-LD 構造化データ(Article / APIReference / FAQPage)を埋め込む", async () => {
    const { body } = await fetchPath("/docs/rokuyo-api");
    expect(body).toContain('type="application/ld+json"');
    expect(body).toContain('"@type":"TechArticle"');
    expect(body).toContain('"@type":"APIReference"');
    expect(body).toContain('"@type":"FAQPage"');
  });

  it("OpenAPI 仕様・GitHub・料金ページへの内部リンクを含む", async () => {
    const { body } = await fetchPath("/docs/rokuyo-api");
    expect(body).toContain("https://shirabe.dev/openapi.yaml");
    expect(body).toContain("https://github.com/techwell-inc-jp/shirabe-calendar-api");
    expect(body).toContain('href="/upgrade"');
    expect(body).toContain('href="/docs/rekichu-api"');
  });

  it("ターゲットキーワード(六曜API・rokuyo API 等)をmeta keywordsに含む", async () => {
    const { body } = await fetchPath("/docs/rokuyo-api");
    expect(body).toContain('name="keywords"');
    expect(body).toContain("六曜API");
    expect(body).toContain("rokuyo API");
    expect(body).toContain("Japanese calendar API");
  });

  it("curl / TypeScript / Python のコード例を含む", async () => {
    const { body } = await fetchPath("/docs/rokuyo-api");
    expect(body).toContain("curl");
    expect(body).toContain("fetch(");
    expect(body).toContain("import");
    expect(body).toContain("requests");
  });

  it("robots メタタグは index,follow を指定", async () => {
    const { body } = await fetchPath("/docs/rokuyo-api");
    expect(body).toContain('name="robots"');
    expect(body).toContain("index,follow");
  });
});

describe("GET /docs/rekichu-api (B-1 SEO page)", () => {
  it("200 を返し、HTMLが返る", async () => {
    const { res, body } = await fetchPath("/docs/rekichu-api");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<!DOCTYPE html>");
  });

  it("主要な暦注(一粒万倍日・天赦日・大明日・寅の日・三隣亡)を含む", async () => {
    const { body } = await fetchPath("/docs/rekichu-api");
    expect(body).toContain("一粒万倍日");
    expect(body).toContain("天赦日");
    expect(body).toContain("大明日");
    expect(body).toContain("寅の日");
    expect(body).toContain("三隣亡");
  });

  it("canonical URL が /docs/rekichu-api を指す", async () => {
    const { body } = await fetchPath("/docs/rekichu-api");
    expect(body).toContain("https://shirabe.dev/docs/rekichu-api");
    expect(body).toContain('rel="canonical"');
  });

  it("JSON-LD 構造化データを埋め込む", async () => {
    const { body } = await fetchPath("/docs/rekichu-api");
    expect(body).toContain('type="application/ld+json"');
    expect(body).toContain('"@type":"TechArticle"');
    expect(body).toContain('"@type":"APIReference"');
    expect(body).toContain('"@type":"FAQPage"');
  });

  it("OpenAPI / GitHub / 六曜ページへの内部リンクを含む", async () => {
    const { body } = await fetchPath("/docs/rekichu-api");
    expect(body).toContain("https://shirabe.dev/openapi.yaml");
    expect(body).toContain("https://github.com/techwell-inc-jp/shirabe-calendar-api");
    expect(body).toContain('href="/docs/rokuyo-api"');
  });

  it("meta keywords に暦注API関連用語を含む", async () => {
    const { body } = await fetchPath("/docs/rekichu-api");
    expect(body).toContain("暦注API");
    expect(body).toContain("一粒万倍日API");
    expect(body).toContain("天赦日API");
  });
});

describe("GET /robots.txt", () => {
  it("200 を返し、text/plain を返す", async () => {
    const { res, body } = await fetchPath("/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(body.length).toBeGreaterThan(0);
  });

  it("User-agent: * で全許可を明示", async () => {
    const { body } = await fetchPath("/robots.txt");
    expect(body).toContain("User-agent: *");
    expect(body).toContain("Allow: /");
  });

  it("主要AIクローラー(GPTBot/ClaudeBot/PerplexityBot/Google-Extended)を明示許可", async () => {
    const { body } = await fetchPath("/robots.txt");
    expect(body).toContain("User-agent: GPTBot");
    expect(body).toContain("User-agent: ClaudeBot");
    expect(body).toContain("User-agent: Claude-Web");
    expect(body).toContain("User-agent: anthropic-ai");
    expect(body).toContain("User-agent: PerplexityBot");
    expect(body).toContain("User-agent: Google-Extended");
    expect(body).toContain("User-agent: ChatGPT-User");
    expect(body).toContain("User-agent: Bytespider");
    expect(body).toContain("User-agent: Applebot-Extended");
  });

  it("sitemap URL を含む", async () => {
    const { body } = await fetchPath("/robots.txt");
    expect(body).toContain("Sitemap: https://shirabe.dev/sitemap.xml");
  });
});

describe("GET /sitemap.xml", () => {
  it("200 を返し、application/xml を返す", async () => {
    const { res, body } = await fetchPath("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain("<urlset");
  });

  it("主要ページ(/, /docs/rokuyo-api, /docs/rekichu-api, /openapi.yaml, /upgrade)を含む", async () => {
    const { body } = await fetchPath("/sitemap.xml");
    expect(body).toContain("<loc>https://shirabe.dev/</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/docs/rokuyo-api</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/docs/rekichu-api</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/openapi.yaml</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/upgrade</loc>");
  });

  it("各urlに priority と changefreq と lastmod を付与", async () => {
    const { body } = await fetchPath("/sitemap.xml");
    expect(body).toContain("<priority>");
    expect(body).toContain("<changefreq>");
    expect(body).toContain("<lastmod>");
  });
});

describe("GET /llms.txt", () => {
  it("200 を返し、text/plain を返す", async () => {
    const { res, body } = await fetchPath("/llms.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(body.length).toBeGreaterThan(0);
  });

  it("H1見出しとサイト要約(>で始まる引用)を含む(llmstxt.org仕様)", async () => {
    const { body } = await fetchPath("/llms.txt");
    expect(body.startsWith("# Shirabe Calendar API")).toBe(true);
    expect(body).toContain("> 日本の暦");
  });

  it("主要エントリポイント(OpenAPI / MCP / 六曜 / 暦注 / GitHub)への誘導リンクを含む", async () => {
    const { body } = await fetchPath("/llms.txt");
    expect(body).toContain("https://shirabe.dev/openapi.yaml");
    expect(body).toContain("https://shirabe.dev/mcp");
    expect(body).toContain("https://shirabe.dev/docs/rokuyo-api");
    expect(body).toContain("https://shirabe.dev/docs/rekichu-api");
    expect(body).toContain("https://github.com/techwell-inc-jp/shirabe-calendar-api");
  });
});
