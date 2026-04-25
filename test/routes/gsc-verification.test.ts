/**
 * Google Search Console 所有権確認(HTML ファイル方式)のテスト
 *
 * shirabe.dev プロパティの ownership verification 用に固定 path で
 * 確認ファイルを配信する。Google は本ファイルを fetch して中身を照合する。
 *
 * 「確認状態を維持するには確認完了後もファイルを削除しないこと」(Google 指示)に
 * 従い、本エンドポイントは恒久的に維持する。本テストは将来うっかり削除しないための
 * regression guard も兼ねる。
 */
import { describe, it, expect } from "vitest";
import app from "../../src/index.js";
import { createMockEnv } from "../helpers/mock-kv.js";

const VERIFICATION_FILENAME = "googlec9be6ddaad3cc09c.html";
const EXPECTED_BODY_LINE = `google-site-verification: ${VERIFICATION_FILENAME}`;

async function fetchPath(path: string) {
  const env = createMockEnv();
  const res = await app.fetch(new Request(`http://localhost${path}`), env);
  const body = await res.text();
  return { res, body };
}

describe(`GET /${VERIFICATION_FILENAME} (Google Search Console ownership verification)`, () => {
  it("200 + text/html を返す", async () => {
    const { res } = await fetchPath(`/${VERIFICATION_FILENAME}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("Google が照合する確認文字列を含む(末尾改行の有無に関係なく)", async () => {
    const { body } = await fetchPath(`/${VERIFICATION_FILENAME}`);
    expect(body.trim()).toBe(EXPECTED_BODY_LINE);
  });

  it("Cache-Control を設定(短期キャッシュで Google の再認証時に追従)", async () => {
    const { res } = await fetchPath(`/${VERIFICATION_FILENAME}`);
    const cache = res.headers.get("cache-control") ?? "";
    expect(cache).toContain("public");
    expect(cache).toMatch(/max-age=\d+/);
  });

  it("認証ミドルウェアをバイパスする(401 にならない、Google bot がアクセス可能)", async () => {
    const { res } = await fetchPath(`/${VERIFICATION_FILENAME}`);
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
  });
});
