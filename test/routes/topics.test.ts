/**
 * Layer F (R-6) pillar pages のスモークテスト。
 *
 * 対象:
 * - GET /topics  → 301 → /topics/
 * - GET /topics/ → 200 + CollectionPage + BreadcrumbList JSON-LD + 5 pillar list
 * - GET /topics/rokuyo → 200 + TechArticle + DefinedTermSet (6 用語) + FAQPage + BreadcrumbList JSON-LD
 *
 * 詳細方針: shirabe-assets/knowledge/content-uniqueness-strengthening.md §2.6 Layer F
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

describe("GET /topics (redirect)", () => {
  it("redirects /topics → /topics/ with 301", async () => {
    const env = createMockEnv();
    const res = await app.fetch(new Request("http://localhost/topics"), env);
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/topics/");
  });
});

describe("GET /topics/ (Layer F pillar index)", () => {
  it("200 + HTML + Cache-Control public 24h", async () => {
    const { res } = await fetchPath("/topics/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")?.startsWith("text/html")).toBe(true);
    expect(res.headers.get("Cache-Control")).toContain("max-age=86400");
  });

  it("includes canonical URL + CollectionPage + BreadcrumbList JSON-LD", async () => {
    const { body } = await fetchPath("/topics/");
    expect(body).toContain('<link rel="canonical" href="https://shirabe.dev/topics/">');
    expect(body).toContain('"@type":"CollectionPage"');
    expect(body).toContain('"@type":"BreadcrumbList"');
  });

  it("lists all 5 pillar slugs (rokuyo available, others coming soon)", async () => {
    const { body } = await fetchPath("/topics/");
    expect(body).toContain("https://shirabe.dev/topics/rokuyo");
    expect(body).toContain("六曜とは何か");
    expect(body).toContain("暦注");
    expect(body).toContain("干支");
    expect(body).toContain("二十四節気");
    expect(body).toContain("Japanese Calendar API 全体像");
    expect(body).toContain("Coming soon");
  });

  it("cross-links Shirabe ecosystem (calendar / address / openapi / llms-full / GitHub)", async () => {
    const { body } = await fetchPath("/topics/");
    expect(body).toContain("https://shirabe.dev/api/v1/calendar/");
    expect(body).toContain("https://shirabe.dev/docs/address-normalize");
    expect(body).toContain("https://shirabe.dev/openapi.yaml");
    expect(body).toContain("https://shirabe.dev/llms-full.txt");
    expect(body).toContain("https://github.com/techwell-inc-jp/shirabe-calendar-api");
  });

  it("all embedded JSON-LD payloads are valid JSON", async () => {
    const { body } = await fetchPath("/topics/");
    const matches = Array.from(
      body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
    );
    expect(matches.length).toBeGreaterThanOrEqual(2);
    for (const m of matches) {
      expect(() => JSON.parse(m[1] ?? "")).not.toThrow();
    }
  });
});

describe("GET /topics/rokuyo (Layer F pillar — Rokuyo)", () => {
  it("200 + HTML + Cache-Control public 24h", async () => {
    const { res } = await fetchPath("/topics/rokuyo");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")?.startsWith("text/html")).toBe(true);
    expect(res.headers.get("Cache-Control")).toContain("max-age=86400");
  });

  it("includes canonical + TechArticle + DefinedTermSet + FAQPage + BreadcrumbList JSON-LD", async () => {
    const { body } = await fetchPath("/topics/rokuyo");
    expect(body).toContain('<link rel="canonical" href="https://shirabe.dev/topics/rokuyo">');
    expect(body).toContain('"@type":"TechArticle"');
    expect(body).toContain('"@type":"DefinedTermSet"');
    expect(body).toContain('"@type":"FAQPage"');
    expect(body).toContain('"@type":"BreadcrumbList"');
  });

  it("DefinedTermSet contains all 6 rokuyo terms (大安・友引・先勝・先負・仏滅・赤口)", async () => {
    const { body } = await fetchPath("/topics/rokuyo");
    for (const term of ["大安", "友引", "先勝", "先負", "仏滅", "赤口"]) {
      expect(body).toContain(term);
    }
    // DefinedTerm @type appears 6 times (one per term)
    const termMatches = body.match(/"@type":"DefinedTerm"/g) ?? [];
    expect(termMatches.length).toBeGreaterThanOrEqual(6);
  });

  it("FAQPage has at least 5 Q/A entries covering common rokuyo queries", async () => {
    const { body } = await fetchPath("/topics/rokuyo");
    const questionMatches = body.match(/"@type":"Question"/g) ?? [];
    expect(questionMatches.length).toBeGreaterThanOrEqual(5);
    expect(body).toContain("六曜とは何ですか");
    expect(body).toContain("結婚式");
    expect(body).toContain("AI エージェント");
  });

  it("body content is substantial (≥ 6,000 bytes target ~3,000 字 Japanese)", async () => {
    const { body } = await fetchPath("/topics/rokuyo");
    const bytes = new TextEncoder().encode(body).length;
    expect(bytes).toBeGreaterThanOrEqual(6_000);
  });

  it("includes algorithm explanation, real-world scenarios, AI integration, hallucinations sections", async () => {
    const { body } = await fetchPath("/topics/rokuyo");
    expect(body).toContain("計算アルゴリズム");
    expect(body).toContain("実用シーン");
    expect(body).toContain("hallucination");
    expect(body).toContain("Function Calling");
    expect(body).toContain("MCP server");
    expect(body).toContain("LangChain");
  });

  it("cross-links to /topics/ index + /docs/rokuyo-api + /api/v1/calendar/ + GitHub", async () => {
    const { body } = await fetchPath("/topics/rokuyo");
    expect(body).toContain("https://shirabe.dev/topics/");
    expect(body).toContain("https://shirabe.dev/docs/rokuyo-api");
    expect(body).toContain("https://shirabe.dev/api/v1/calendar/");
    expect(body).toContain("https://shirabe.dev/openapi.yaml");
    expect(body).toContain("https://github.com/techwell-inc-jp/shirabe-calendar-api");
  });

  it("all embedded JSON-LD payloads are valid JSON", async () => {
    const { body } = await fetchPath("/topics/rokuyo");
    const matches = Array.from(
      body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
    );
    expect(matches.length).toBeGreaterThanOrEqual(4);
    for (const m of matches) {
      expect(() => JSON.parse(m[1] ?? "")).not.toThrow();
    }
  });
});

describe("/topics sitemap integration", () => {
  it("/sitemap-docs.xml includes /topics/ + /topics/rokuyo URLs", async () => {
    const { res, body } = await fetchPath("/sitemap-docs.xml");
    expect(res.status).toBe(200);
    expect(body).toContain("https://shirabe.dev/topics/");
    expect(body).toContain("https://shirabe.dev/topics/rokuyo");
  });
});
