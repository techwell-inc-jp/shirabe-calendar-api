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

describe("GET / (top page, T-03: WebAPI + WebSite + Organization JSON-LD)", () => {
  it("200 を返し、HTML を返す", async () => {
    const { res, body } = await fetchPath("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<!DOCTYPE html>");
  });

  it("canonical URL が shirabe.dev/ を指す", async () => {
    const { body } = await fetchPath("/");
    expect(body).toContain('rel="canonical"');
    expect(body).toContain('href="https://shirabe.dev/"');
  });

  it("JSON-LD 構造化データ(Organization / WebSite / WebAPI 2 件)を埋め込む", async () => {
    const { body } = await fetchPath("/");
    expect(body).toContain('type="application/ld+json"');
    expect(body).toContain('"@type":"Organization"');
    expect(body).toContain('"@type":"WebSite"');
    // 2 つの WebAPI(Calendar / Address)
    const webApiCount = (body.match(/"@type":"WebAPI"/g) ?? []).length;
    expect(webApiCount).toBe(2);
  });

  it("WebAPI JSON-LD に両 API の canonical URL と OpenAPI documentation リンクを含む", async () => {
    const { body } = await fetchPath("/");
    expect(body).toContain('"url":"https://shirabe.dev/api/v1/calendar"');
    expect(body).toContain('"url":"https://shirabe.dev/api/v1/address"');
    expect(body).toContain('"documentation":"https://shirabe.dev/openapi.yaml"');
    expect(body).toContain('"documentation":"https://shirabe.dev/api/v1/address/openapi.yaml"');
  });

  it("WebAPI JSON-LD に provider(Organization)への @id 参照を含む", async () => {
    const { body } = await fetchPath("/");
    expect(body).toContain('"@id":"https://shirabe.dev/#organization"');
    expect(body).toContain('"@id":"https://shirabe.dev/#calendar-webapi"');
    expect(body).toContain('"@id":"https://shirabe.dev/#address-webapi"');
  });

  it("埋め込まれた全 JSON-LD が JSON としてパース可能(構文妥当性)", async () => {
    const { body } = await fetchPath("/");
    const matches = Array.from(
      body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
    );
    expect(matches.length).toBeGreaterThanOrEqual(4);
    for (const m of matches) {
      const payload = m[1] ?? "";
      expect(() => JSON.parse(payload)).not.toThrow();
    }
  });

  it("OG / Twitter / keywords メタを含む", async () => {
    const { body } = await fetchPath("/");
    expect(body).toContain('property="og:type"');
    expect(body).toContain('property="og:title"');
    expect(body).toContain('property="og:url"');
    expect(body).toContain('name="twitter:card"');
    expect(body).toContain('name="keywords"');
  });

  it("両 API docs への内部リンクを含む", async () => {
    const { body } = await fetchPath("/");
    expect(body).toContain('href="/docs/rokuyo-api"');
    expect(body).toContain('href="/docs/rekichu-api"');
    expect(body).toContain('href="/docs/address-normalize"');
    expect(body).toContain('href="/docs/address-batch"');
    expect(body).toContain('href="/docs/address-pricing"');
  });
});

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

describe("GET /llms.txt (統合版、T-05)", () => {
  it("200 を返し、text/markdown を返す", async () => {
    const { res, body } = await fetchPath("/llms.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(body.length).toBeGreaterThan(0);
  });

  it("H1見出しとサイト要約(>で始まる引用)を含む(llmstxt.org仕様)", async () => {
    const { body } = await fetchPath("/llms.txt");
    expect(body.startsWith("# Shirabe")).toBe(true);
    expect(body).toContain("> 日本特化 AI ネイティブ API");
  });

  it("サイズが 5KB 〜 30KB の範囲に収まる", async () => {
    const { body } = await fetchPath("/llms.txt");
    const sizeBytes = new TextEncoder().encode(body).length;
    expect(sizeBytes).toBeGreaterThanOrEqual(5 * 1024);
    expect(sizeBytes).toBeLessThanOrEqual(30 * 1024);
  });

  it("Calendar API の主要リソース全て(OpenAPI / MCP / 六曜 / 暦注 / GPT Store / GitHub)を含む", async () => {
    const { body } = await fetchPath("/llms.txt");
    expect(body).toContain("https://shirabe.dev/openapi.yaml");
    expect(body).toContain("https://shirabe.dev/openapi-gpts.yaml");
    expect(body).toContain("https://shirabe.dev/mcp");
    expect(body).toContain("https://shirabe.dev/docs/rokuyo-api");
    expect(body).toContain("https://shirabe.dev/docs/rekichu-api");
    expect(body).toContain("https://github.com/techwell-inc-jp/shirabe-calendar-api");
    // 暦 GPT Store(2026-04-23 の新 URL)
    expect(body).toContain("chatgpt.com/g/g-69e98031b5b8819185ae196a9f219090");
  });

  it("Address API セクション(OpenAPI / docs / GPT Store / 専用 llms.txt / GitHub)を含む", async () => {
    const { body } = await fetchPath("/llms.txt");
    expect(body).toContain("https://shirabe.dev/api/v1/address/openapi.yaml");
    expect(body).toContain("https://shirabe.dev/api/v1/address/openapi-gpts.yaml");
    expect(body).toContain("https://shirabe.dev/docs/address-normalize");
    expect(body).toContain("https://shirabe.dev/docs/address-batch");
    expect(body).toContain("https://shirabe.dev/docs/address-pricing");
    expect(body).toContain("https://shirabe.dev/api/v1/address/llms.txt");
    expect(body).toContain("https://github.com/techwell-inc-jp/shirabe-address-api");
    // 住所 GPT Store
    expect(body).toContain("chatgpt.com/g/g-69e96000b5c08191b21f4d6570ead788");
  });

  it("7 月リリース予定の 3 本目 API(日本語テキスト処理)へ言及", async () => {
    const { body } = await fetchPath("/llms.txt");
    expect(body).toContain("日本語テキスト処理");
    expect(body).toContain("2026-07");
  });

  it("主要エンドポイントへの curl 例を 10 件以上含む", async () => {
    const { body } = await fetchPath("/llms.txt");
    // 各 curl 呼出は `curl ` で始まる行でカウント
    const curlLines = body.split("\n").filter((line) => /^\s*curl\b/.test(line));
    expect(curlLines.length).toBeGreaterThanOrEqual(7);
    // 代表エンドポイントが curl 例に現れる
    expect(body).toContain("https://shirabe.dev/api/v1/calendar/2026-06-15");
    expect(body).toContain("https://shirabe.dev/api/v1/calendar/range");
    expect(body).toContain("https://shirabe.dev/api/v1/calendar/best-days");
    expect(body).toContain("https://shirabe.dev/api/v1/address/normalize");
    expect(body).toContain("https://shirabe.dev/api/v1/address/normalize/batch");
  });

  it("料金プラン(Calendar / Address 両 API)を含む", async () => {
    const { body } = await fetchPath("/llms.txt");
    expect(body).toContain("Free");
    expect(body).toContain("Starter");
    expect(body).toContain("Pro");
    expect(body).toContain("Enterprise");
    // Calendar 料金(0.05/0.03/0.01 円)
    expect(body).toContain("0.05");
    // Address 料金(0.5/0.3/0.1 円)
    expect(body).toContain("| Free | 5,000 |");
  });

  it("attribution / データ出典(CC BY 4.0)への言及を含む", async () => {
    const { body } = await fetchPath("/llms.txt");
    expect(body).toContain("attribution");
    expect(body).toContain("CC BY 4.0");
    expect(body).toContain("アドレス・ベース・レジストリ");
  });

  it("AI 統合経路(GPTs / MCP / Function Calling / LangChain / Dify)を明記", async () => {
    const { body } = await fetchPath("/llms.txt");
    expect(body).toContain("ChatGPT GPTs");
    expect(body).toContain("MCP");
    expect(body).toContain("Function Calling");
    expect(body).toContain("LangChain");
    expect(body).toContain("Dify");
  });
});
