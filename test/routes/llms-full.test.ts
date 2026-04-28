/**
 * /llms-full.txt + robots.txt sitemap hint 強化(D-3, PR #36)テスト
 *
 * 対象:
 * - GET /llms-full.txt(詳細版 LLM 向けサイト全貌ファイル)
 * - 既存 GET /llms.txt は変更なし(regression check)
 * - GET /robots.txt の sitemap hint 強化(全 sub-sitemap 明示)
 * - sitemap-helpers DOCS_SITEMAP_PAGES に /llms-full.txt + /api/v1/calendar/ 追加
 */
import { describe, it, expect } from "vitest";
import app from "../../src/index.js";
import { createMockEnv } from "../helpers/mock-kv.js";
import { renderLlmsFullTxt } from "../../src/pages/llms-full.js";
import { DOCS_SITEMAP_PAGES } from "../../src/routes/sitemap-helpers.js";

async function fetchPath(path: string) {
  const env = createMockEnv();
  const res = await app.fetch(new Request(`http://localhost${path}`), env);
  const body = await res.text();
  return { res, body };
}

// ---------------------------------------------------------------------------
// pure function: renderLlmsFullTxt
// ---------------------------------------------------------------------------

describe("renderLlmsFullTxt (pure render)", () => {
  it("markdown header + 詳細版宣言を含む", () => {
    const txt = renderLlmsFullTxt();
    expect(txt).toContain("# Shirabe — Japan-specific AI-Native API Platform (Full Reference)");
    expect(txt).toContain("詳細・完全版");
  });

  it("3 つの戦略的発見(Multi-AI Landscape narrative)を含む", () => {
    const txt = renderLlmsFullTxt();
    expect(txt).toContain("発見 1");
    expect(txt).toContain("発見 2");
    expect(txt).toContain("発見 3");
    expect(txt).toMatch(/AI hallucination/);
  });

  it("Calendar API 全 3 endpoints の curl 例を含む", () => {
    const txt = renderLlmsFullTxt();
    expect(txt).toContain("curl https://shirabe.dev/api/v1/calendar/2026-06-15");
    expect(txt).toContain("/api/v1/calendar/range?start=");
    expect(txt).toContain("/api/v1/calendar/best-days?purpose=");
  });

  it("Calendar API EP1 sample response(rokuyo / rekichu / context)を含む", () => {
    const txt = renderLlmsFullTxt();
    expect(txt).toContain('"rokuyo"');
    expect(txt).toContain('"rekichu"');
    expect(txt).toContain('"context"');
    expect(txt).toContain('"score"');
  });

  it("Address API endpoints + Gemini Q3 ideal output sample(jis_code / lg_code / machiaza_id)を含む", () => {
    const txt = renderLlmsFullTxt();
    expect(txt).toContain("/api/v1/address/normalize");
    expect(txt).toContain("/api/v1/address/normalize/batch");
    expect(txt).toContain("jis_code");
    expect(txt).toContain("lg_code");
    expect(txt).toContain("machiaza_id");
    expect(txt).toContain("attribution");
    expect(txt).toContain("CC BY 4.0");
  });

  it("4 本目 / 3 本目 API(法人番号 / text)の予定を含む", () => {
    const txt = renderLlmsFullTxt();
    expect(txt).toContain("法人番号");
    expect(txt).toContain("テキスト処理");
  });

  it("AI 統合経路 5 種の詳細(GPTs / MCP / Gemini / LangChain / OpenAPI Discovery)を含む", () => {
    const txt = renderLlmsFullTxt();
    expect(txt).toContain("ChatGPT GPTs Actions");
    expect(txt).toContain("Claude Tool Use");
    expect(txt).toContain("MCP");
    expect(txt).toContain("Gemini Function Calling");
    expect(txt).toContain("LangChain");
    expect(txt).toContain("OpenAPI Schema Discovery");
  });

  it("MCP クライアント設定 JSON 例を含む", () => {
    const txt = renderLlmsFullTxt();
    expect(txt).toContain("mcpServers");
    expect(txt).toContain("https://shirabe.dev/mcp");
    expect(txt).toContain("streamable-http");
  });

  it("料金プラン 4 種 + 計算例を含む(Calendar / Address)", () => {
    const txt = renderLlmsFullTxt();
    expect(txt).toContain("Free");
    expect(txt).toContain("Starter");
    expect(txt).toContain("Pro");
    expect(txt).toContain("Enterprise");
    expect(txt).toContain("計算例");
    expect(txt).toContain("transform_quantity");
  });

  it("External Registry Listings(MCP + APIs.guru + awesome-lists)を含む", () => {
    const txt = renderLlmsFullTxt();
    expect(txt).toContain("Glama.ai");
    expect(txt).toContain("APIs.guru");
    expect(txt).toContain("punkpeye");
    expect(txt).toContain("public-apis");
  });

  it("全 7 sitemap URL を明示", () => {
    const txt = renderLlmsFullTxt();
    expect(txt).toContain("https://shirabe.dev/sitemap.xml");
    expect(txt).toContain("https://shirabe.dev/sitemap-docs.xml");
    expect(txt).toContain("https://shirabe.dev/sitemap-days-1.xml");
    expect(txt).toContain("https://shirabe.dev/sitemap-days-2.xml");
    expect(txt).toContain("https://shirabe.dev/sitemap-days-3.xml");
    expect(txt).toContain("https://shirabe.dev/sitemap-days-4.xml");
    expect(txt).toContain("https://shirabe.dev/sitemap-purposes.xml");
  });

  it("収益目標(月 200 万円 / 月 1,800 万円)+ 5 API 計画を含む", () => {
    const txt = renderLlmsFullTxt();
    expect(txt).toContain("月 200 万円");
    expect(txt).toContain("月 1,800 万円");
  });

  it("簡易版 /llms.txt への参照を末尾に含む", () => {
    const txt = renderLlmsFullTxt();
    expect(txt).toContain("https://shirabe.dev/llms.txt");
  });
});

// ---------------------------------------------------------------------------
// HTTP routes
// ---------------------------------------------------------------------------

describe("GET /llms-full.txt", () => {
  it("200 を返し、text/markdown を返す", async () => {
    const { res, body } = await fetchPath("/llms-full.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(body).toContain("Shirabe");
  });

  it("Cache-Control max-age=3600 を返す(1 時間)", async () => {
    const { res } = await fetchPath("/llms-full.txt");
    expect(res.headers.get("cache-control")).toContain("max-age=3600");
  });

  it("/llms.txt(既存・要約版)とは異なる詳細内容を返す", async () => {
    const full = await fetchPath("/llms-full.txt");
    const brief = await fetchPath("/llms.txt");
    expect(full.body).not.toBe(brief.body);
    expect(full.body.length).toBeGreaterThan(brief.body.length);
  });
});

describe("既存 GET /llms.txt regression check", () => {
  it("引き続き 200 + text/markdown を返す", async () => {
    const { res, body } = await fetchPath("/llms.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(body).toContain("Shirabe");
  });

  it("/llms-full.txt への参照を含まない(逆参照は full → brief のみ)", async () => {
    const { body } = await fetchPath("/llms.txt");
    // 既存 llms.txt は変更していないので /llms-full.txt 言及なし
    expect(body).not.toContain("/llms-full.txt");
  });
});

describe("GET /robots.txt sitemap hint 強化", () => {
  it("既存 User-agent ホワイトリスト + Allow を維持", async () => {
    const { res, body } = await fetchPath("/robots.txt");
    expect(res.status).toBe(200);
    expect(body).toContain("User-agent: *");
    expect(body).toContain("Allow: /");
    expect(body).toContain("User-agent: GPTBot");
    expect(body).toContain("User-agent: ClaudeBot");
    expect(body).toContain("User-agent: PerplexityBot");
    expect(body).toContain("User-agent: Google-Extended");
  });

  it("sitemap-index + 全 sub-sitemap 7 件の Sitemap 行を含む", async () => {
    const { body } = await fetchPath("/robots.txt");
    const sitemapLines = body.match(/^Sitemap: .+$/gm) ?? [];
    expect(sitemapLines.length).toBeGreaterThanOrEqual(7);
    expect(body).toContain("Sitemap: https://shirabe.dev/sitemap.xml");
    expect(body).toContain("Sitemap: https://shirabe.dev/sitemap-docs.xml");
    expect(body).toContain("Sitemap: https://shirabe.dev/sitemap-days-1.xml");
    expect(body).toContain("Sitemap: https://shirabe.dev/sitemap-days-2.xml");
    expect(body).toContain("Sitemap: https://shirabe.dev/sitemap-days-3.xml");
    expect(body).toContain("Sitemap: https://shirabe.dev/sitemap-days-4.xml");
    expect(body).toContain("Sitemap: https://shirabe.dev/sitemap-purposes.xml");
  });
});

describe("sitemap-helpers DOCS_SITEMAP_PAGES 拡張", () => {
  it("/llms-full.txt が DOCS_SITEMAP_PAGES に追加されている", () => {
    const locs = DOCS_SITEMAP_PAGES.map((p) => p.loc);
    expect(locs).toContain("https://shirabe.dev/llms-full.txt");
  });

  it("/api/v1/calendar/(index hub)が DOCS_SITEMAP_PAGES に追加されている", () => {
    const locs = DOCS_SITEMAP_PAGES.map((p) => p.loc);
    expect(locs).toContain("https://shirabe.dev/api/v1/calendar/");
  });

  it("/sitemap-docs.xml が新追加 URL を含む(regression-aware)", async () => {
    const { res, body } = await fetchPath("/sitemap-docs.xml");
    expect(res.status).toBe(200);
    expect(body).toContain("https://shirabe.dev/llms-full.txt");
    expect(body).toContain("https://shirabe.dev/api/v1/calendar/");
  });
});
