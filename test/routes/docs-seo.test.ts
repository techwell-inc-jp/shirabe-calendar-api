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

describe("GET /docs/calendar-pricing (C-1 paid 突破経路 pricing page)", () => {
  it("200 を返し、HTML を返す", async () => {
    const { res, body } = await fetchPath("/docs/calendar-pricing");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<!DOCTYPE html>");
  });

  it("canonical URL が /docs/calendar-pricing を指す", async () => {
    const { body } = await fetchPath("/docs/calendar-pricing");
    expect(body).toContain('rel="canonical"');
    expect(body).toContain("https://shirabe.dev/docs/calendar-pricing");
  });

  it("4 プラン(Free / Starter / Pro / Enterprise)の月間上限と単価を含む", async () => {
    const { body } = await fetchPath("/docs/calendar-pricing");
    expect(body).toContain("Free");
    expect(body).toContain("10,000 回");
    expect(body).toContain("Starter");
    expect(body).toContain("500,000 回");
    expect(body).toContain("¥0.05");
    expect(body).toContain("Pro");
    expect(body).toContain("5,000,000 回");
    expect(body).toContain("¥0.03");
    expect(body).toContain("Enterprise");
    expect(body).toContain("¥0.01");
  });

  it("JSON-LD 構造化データ(TechArticle / AggregateOffer / FAQPage / NewsArticle)を埋め込む", async () => {
    const { body } = await fetchPath("/docs/calendar-pricing");
    expect(body).toContain('type="application/ld+json"');
    expect(body).toContain('"@type":"TechArticle"');
    expect(body).toContain('"@type":"AggregateOffer"');
    expect(body).toContain('"@type":"FAQPage"');
    expect(body).toContain('"@type":"NewsArticle"');
  });

  it("埋め込まれた全 JSON-LD が JSON としてパース可能(構文妥当性)", async () => {
    const { body } = await fetchPath("/docs/calendar-pricing");
    const matches = Array.from(
      body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
    );
    expect(matches.length).toBe(4);
    for (const m of matches) {
      const payload = m[1] ?? "";
      expect(() => JSON.parse(payload)).not.toThrow();
    }
  });

  it("住所 API 料金ページ + /upgrade + 暦 docs への内部リンクを含む", async () => {
    const { body } = await fetchPath("/docs/calendar-pricing");
    expect(body).toContain('href="/upgrade"');
    expect(body).toContain('href="/docs/rokuyo-api"');
    expect(body).toContain('href="/docs/rekichu-api"');
    expect(body).toContain("/docs/address-pricing");
  });

  it("text API 料金ページへの cross-link を含む(B-3 relevance signal)", async () => {
    const { body } = await fetchPath("/docs/calendar-pricing");
    expect(body).toContain("/docs/text-pricing");
  });

  it("plan-pricing.ts の PRICING_URL 整合(PR #42 hardcode に対応)", async () => {
    // PR #42 で plan-pricing.ts に hardcode した URL は本ページが provide
    const { body } = await fetchPath("/docs/calendar-pricing");
    expect(body).toContain("https://shirabe.dev/docs/calendar-pricing");
  });

  it("robots メタタグは index,follow を指定", async () => {
    const { body } = await fetchPath("/docs/calendar-pricing");
    expect(body).toContain('name="robots"');
    expect(body).toContain("index,follow");
  });
});

describe("GET /announcements/2026-05-01 (Phase 4 永続的告知ページ)", () => {
  it("200 を返し、HTML を返す", async () => {
    const { res, body } = await fetchPath("/announcements/2026-05-01");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<!DOCTYPE html>");
  });

  it("Cloudflare CDN cache (max-age=86400) を指定", async () => {
    const { res } = await fetchPath("/announcements/2026-05-01");
    expect(res.headers.get("cache-control")).toContain("max-age=86400");
  });

  it("canonical URL が /announcements/2026-05-01 を指す", async () => {
    const { body } = await fetchPath("/announcements/2026-05-01");
    expect(body).toContain('rel="canonical"');
    expect(body).toContain("https://shirabe.dev/announcements/2026-05-01");
  });

  it("ページタイトル + リリース日 (2026-05-01) + v1.0.0 を含む", async () => {
    const { body } = await fetchPath("/announcements/2026-05-01");
    expect(body).toContain("Shirabe Address API");
    expect(body).toContain("2026-05-01");
    expect(body).toContain("v1.0.0");
  });

  it("JSON-LD 構造化データ(NewsArticle / SoftwareApplication / FAQPage の 3 種)を埋め込む", async () => {
    const { body } = await fetchPath("/announcements/2026-05-01");
    expect(body).toContain('type="application/ld+json"');
    expect(body).toContain('"@type":"NewsArticle"');
    expect(body).toContain('"@type":"SoftwareApplication"');
    expect(body).toContain('"@type":"FAQPage"');
  });

  it("埋め込まれた全 JSON-LD が JSON としてパース可能(構文妥当性)", async () => {
    const { body } = await fetchPath("/announcements/2026-05-01");
    const matches = Array.from(
      body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
    );
    expect(matches.length).toBe(3); // NewsArticle / SoftwareApplication / FAQPage
    for (const m of matches) {
      const payload = m[1] ?? "";
      expect(() => JSON.parse(payload)).not.toThrow();
    }
  });

  it("SoftwareApplication JSON-LD に softwareVersion: 1.0.0 + datePublished: 2026-05-01 を含む", async () => {
    const { body } = await fetchPath("/announcements/2026-05-01");
    expect(body).toContain('"softwareVersion":"1.0.0"');
    expect(body).toContain('"datePublished":"2026-05-01"');
  });

  it("差別化価値の 5 点(AI ネイティブ / 3 経路 / ABR 全 47 都道府県 / CC BY 4.0 attribution / 表記ゆれ補正 4 ルール)を含む", async () => {
    const { body } = await fetchPath("/announcements/2026-05-01");
    expect(body).toContain("AI ネイティブ");
    expect(body).toContain("ABR");
    expect(body).toContain("CC BY 4.0");
    expect(body).toContain("attribution");
    expect(body).toContain("表記ゆれ補正");
  });

  it("4 AI 観測の独自データ (Multi-AI Landscape) セクションを含む", async () => {
    const { body } = await fetchPath("/announcements/2026-05-01");
    expect(body).toContain("Multi-AI Landscape");
    expect(body).toContain("Jusho");
    expect(body).toContain("BODIK");
    expect(body).toContain("ZENRIN");
  });

  it("OpenAPI 3.1 仕様 + GitHub + GPT Store + 関連 docs への内部 / 外部リンクを含む", async () => {
    const { body } = await fetchPath("/announcements/2026-05-01");
    expect(body).toContain("https://shirabe.dev/api/v1/address/openapi.yaml");
    expect(body).toContain("https://shirabe.dev/api/v1/address/openapi-gpts.yaml");
    expect(body).toContain("https://shirabe.dev/api/v1/address/llms.txt");
    expect(body).toContain("https://github.com/techwell-inc-jp/shirabe-address-api");
    expect(body).toContain("g-69e96000b5c08191b21f4d6570ead788");
    expect(body).toContain('href="/docs/rokuyo-api"');
  });

  it("meta keywords に Address API ターゲットキーワードを含む", async () => {
    const { body } = await fetchPath("/announcements/2026-05-01");
    expect(body).toContain('name="keywords"');
    expect(body).toContain("Shirabe Address API");
    expect(body).toContain("住所正規化 API");
    expect(body).toContain("abr-geocoder");
  });

  it("OG / Twitter Card メタを含む", async () => {
    const { body } = await fetchPath("/announcements/2026-05-01");
    expect(body).toContain('property="og:type"');
    expect(body).toContain('property="og:title"');
    expect(body).toContain('property="og:url"');
    expect(body).toContain('name="twitter:card"');
  });

  it("robots メタタグは index,follow を指定", async () => {
    const { body } = await fetchPath("/announcements/2026-05-01");
    expect(body).toContain('name="robots"');
    expect(body).toContain("index,follow");
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

describe("GET /sitemap.xml (T-04: sitemap index)", () => {
  it("200 を返し、application/xml を返す", async () => {
    const { res, body } = await fetchPath("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    // T-04 以降は sitemap index 形式
    expect(body).toContain("<sitemapindex");
  });

  it("サブサイトマップ(docs + days-1..4)への参照を含む", async () => {
    const { body } = await fetchPath("/sitemap.xml");
    expect(body).toContain("<loc>https://shirabe.dev/sitemap-docs.xml</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/sitemap-days-1.xml</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/sitemap-days-2.xml</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/sitemap-days-3.xml</loc>");
    expect(body).toContain("<loc>https://shirabe.dev/sitemap-days-4.xml</loc>");
  });

  it("各サブサイトマップ参照に lastmod を付与(sitemap index では priority/changefreq は使わない)", async () => {
    const { body } = await fetchPath("/sitemap.xml");
    expect(body).toContain("<lastmod>");
    // sitemap index 仕様では <priority> / <changefreq> は urlset 側(個別 URL 単位)
    // で使用される。index 自体には含まれない。それらは /sitemap-docs.xml や
    // /sitemap-days-*.xml 内で設定される(そちらは sitemap.test.ts 側で検証)。
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

  it("3 本目 API(日本語テキスト処理、2026-05-31 リリース予定)へ言及", async () => {
    const { body } = await fetchPath("/llms.txt");
    expect(body).toContain("日本語テキスト処理");
    expect(body).toContain("2026-05-31");
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

  it("T-06: MCP Registry Listings 節に Glama.ai リスティング URL + Categories + claim 日付を含む", async () => {
    const { body } = await fetchPath("/llms.txt");
    expect(body).toContain("## External Registry Listings");
    expect(body).toContain("### MCP Registry Listings");
    expect(body).toContain("Glama.ai");
    expect(body).toContain("https://glama.ai/mcp/servers/techwell-inc-jp/shirabe-calendar-api");
    expect(body).toContain("Calendar Management");
    expect(body).toContain("Developer Tools");
    expect(body).toContain("Art & Culture");
    expect(body).toContain("2026-04-24");
    expect(body).toContain("Shirabe-dev-sys");
    // 住所 API は MCP 未実装のため MCP registry 対象外と明記
    expect(body).toContain("住所 API");
    expect(body).toContain("MCP 未実装");
  });

  it("T-07: OpenAPI Directory Listings 節に APIs.guru の PR URL + reverse-DNS paths を含む", async () => {
    const { body } = await fetchPath("/llms.txt");
    expect(body).toContain("### OpenAPI Directory Listings");
    expect(body).toContain("APIs.guru");
    expect(body).toContain("https://github.com/APIs-guru/openapi-directory/pull/2452");
    expect(body).toContain("APIs/shirabe.dev/calendar/1.0.0/openapi.yaml");
    expect(body).toContain("APIs/shirabe.dev/address/1.0.0/openapi.yaml");
    expect(body).toContain("https://github.com/Shirabe-dev-sys/openapi-directory");
  });
});
