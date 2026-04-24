/**
 * OG / Article default image endpoint (/og-default.svg) のテスト
 *
 * Schema.org image 必須フィールド + Twitter / Discord card preview で
 * 参照される SVG を serve する endpoint の動作確認。
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

describe("GET /og-default.svg (OG / Article default image)", () => {
  it("200 を返し、Content-Type: image/svg+xml を返す", async () => {
    const { res } = await fetchPath("/og-default.svg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
  });

  it("Cache-Control に public + max-age(長期) + immutable を含む", async () => {
    const { res } = await fetchPath("/og-default.svg");
    const cache = res.headers.get("cache-control") ?? "";
    expect(cache).toContain("public");
    expect(cache).toMatch(/max-age=\d{5,}/); // 10^4 秒以上の長期 cache
    expect(cache).toContain("immutable");
  });

  it("body が valid な SVG XML で、Shirabe ブランディングを含む", async () => {
    const { body } = await fetchPath("/og-default.svg");
    expect(body).toContain('<?xml version="1.0"');
    expect(body).toContain("<svg");
    expect(body).toContain("</svg>");
    expect(body).toContain('width="1200"');
    expect(body).toContain('height="630"');
    expect(body).toContain("Shirabe");
    expect(body).toContain("shirabe.dev");
    expect(body).toContain("AI"); // 日本語 + 英語の tagline 両方を含む
  });

  it("aria-label と role='img' を付与(アクセシビリティ)", async () => {
    const { body } = await fetchPath("/og-default.svg");
    expect(body).toContain('role="img"');
    expect(body).toContain("aria-label=");
  });
});
