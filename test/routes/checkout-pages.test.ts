/**
 * Phase 6: 決済導線ページのルーティングテスト
 */
import { describe, it, expect } from "vitest";
import app from "../../src/index.js";
import { createMockEnv } from "../helpers/mock-kv.js";

async function fetchPage(path: string) {
  const env = createMockEnv();
  const res = await app.fetch(new Request(`http://localhost${path}`), env);
  const html = await res.text();
  return { res, html };
}

describe("GET /upgrade", () => {
  it("200 を返し、HTMLが返る", async () => {
    const { res, html } = await fetchPage("/upgrade");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("全プラン（Free / Starter / Pro / Enterprise）の情報を含む", async () => {
    const { html } = await fetchPage("/upgrade");
    expect(html).toContain("Free");
    expect(html).toContain("Starter");
    expect(html).toContain("Pro");
    expect(html).toContain("Enterprise");
  });

  it("各プランの単価・上限・レート制限が含まれる", async () => {
    const { html } = await fetchPage("/upgrade");
    // 単価
    expect(html).toContain("¥0.05");
    expect(html).toContain("¥0.03");
    expect(html).toContain("¥0.01");
    // 上限
    expect(html).toContain("10,000");
    expect(html).toContain("500,000");
    expect(html).toContain("5,000,000");
    // レート制限
    expect(html).toContain("1 req/s");
    expect(html).toContain("30 req/s");
    expect(html).toContain("100 req/s");
    expect(html).toContain("500 req/s");
  });

  it("メール入力 + プラン選択フォームを含む", async () => {
    const { html } = await fetchPage("/upgrade");
    expect(html).toContain('type="email"');
    expect(html).toContain('name="plan"');
    expect(html).toContain("/api/v1/checkout");
  });
});

describe("GET /checkout/success", () => {
  it("session_id クエリ付きで 200 を返し、session_id が表示される", async () => {
    const { res, html } = await fetchPage("/checkout/success?session_id=cs_test_abc123");
    expect(res.status).toBe(200);
    expect(html).toContain("cs_test_abc123");
  });

  it("session_id なしでも 200 を返す", async () => {
    const { res, html } = await fetchPage("/checkout/success");
    expect(res.status).toBe(200);
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("「二度と表示されません」の警告文を含む", async () => {
    const { html } = await fetchPage("/checkout/success?session_id=cs_test");
    expect(html).toContain("二度と表示されません");
  });

  it("MCP設定例のスニペットを含む", async () => {
    const { html } = await fetchPage("/checkout/success?session_id=cs_test");
    expect(html).toContain("mcpServers");
    expect(html).toContain("@shirabe-api/calendar-mcp");
  });

  it("session_id はHTMLエスケープされる", async () => {
    const { html } = await fetchPage("/checkout/success?session_id=%3Cscript%3Ealert(1)%3C/script%3E");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("GET /checkout/cancel", () => {
  it("200 を返す", async () => {
    const { res, html } = await fetchPage("/checkout/cancel");
    expect(res.status).toBe(200);
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("キャンセルメッセージを含む", async () => {
    const { html } = await fetchPage("/checkout/cancel");
    expect(html).toContain("キャンセル");
  });

  it("/upgrade へのリンクを含む", async () => {
    const { html } = await fetchPage("/checkout/cancel");
    expect(html).toContain('href="/upgrade"');
  });
});

describe("GET / (トップページ) — Phase 6 料金更新", () => {
  it("新料金体系の単価を含む", async () => {
    const { res, html } = await fetchPage("/");
    expect(res.status).toBe(200);
    expect(html).toContain("¥0.05");
    expect(html).toContain("¥0.03");
    expect(html).toContain("¥0.01");
  });

  it("旧料金（1円/回）表記が削除されている", async () => {
    const { html } = await fetchPage("/");
    expect(html).not.toContain("1円/回");
  });

  it("/upgrade への導線リンクを含む", async () => {
    const { html } = await fetchPage("/");
    expect(html).toContain('href="/upgrade"');
  });
});
