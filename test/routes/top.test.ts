/**
 * トップページ(GET /)のスモークテスト。
 *
 * Lever C-3: Reach 面(landing)が ¥40k 入口 + cross-API 上流(Hub License)を
 * 向いているか。per-request の既存導線は維持しつつ /pricing + 自動見積へ誘導する。
 */
import { describe, it, expect } from "vitest";
import { renderTopPage } from "../../src/pages/top.js";

describe("renderTopPage", () => {
  const html = renderTopPage();

  it("3 API(暦・住所・テキスト)を提供中として掲示", () => {
    expect(html).toContain("Shirabe Calendar API");
    expect(html).toContain("Shirabe Address API");
    expect(html).toContain("Shirabe Text API");
  });

  it("per-request 既存導線(従量課金 + /upgrade)を維持(regression)", () => {
    expect(html).toContain("従量課金");
    expect(html).toContain('href="/upgrade"');
  });

  it("Hub License 階段(¥40k 入口 → ¥120k 背骨)を Reach に露出", () => {
    expect(html).toContain("Hub License");
    expect(html).toContain("¥40,000");
    expect(html).toContain("¥120,000");
    expect(html).toContain("入口");
    expect(html).toContain("背骨");
  });

  it("/pricing + AI-callable 自動見積 endpoint へ誘導", () => {
    expect(html).toContain('href="/pricing"');
    expect(html).toContain("https://shirabe.dev/api/v1/pricing/quote?apis=address,text");
  });
});
