/**
 * POST /api/v1/calendar/keys/reissue(再発行リクエスト受付)のテスト
 *
 * anti-enumeration(契約有無で応答を変えない)+ JSON/form 両対応 + トークン発行を検証。
 * 確定→回転は consumeReissueToken + rotateByToken(reissue-store.test.ts で個別検証済)を
 * 本テストでも token 捕捉 → 回転で end-to-end に通す。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { keysReissue } from "../../src/routes/keys-reissue.js";
import {
  EMAIL_INDEX_PREFIX,
  consumeReissueToken,
  rotateByToken,
} from "../../src/keys/reissue-store.js";
import { sha256Hex } from "../../src/util/sha256.js";
import type { AppEnv, Env, EmailSendMessage } from "../../src/types/env.js";
import { createMockEnv } from "../helpers/mock-kv.js";

function createReissueEnv() {
  const base = createMockEnv();
  const sent: EmailSendMessage[] = [];
  const env = {
    ...base,
    EMAIL: {
      send: async (m: EmailSendMessage) => {
        sent.push(m);
        return {};
      },
    },
  } as unknown as Env;
  return { env, sent };
}

/** email から confirmUrl の token を取り出す。 */
function tokenFromMail(mail: EmailSendMessage): string {
  const match = (mail.text ?? "").match(/token=([0-9a-f]{64})/);
  if (!match) throw new Error("token not found in email");
  return match[1];
}

describe("POST /api/v1/calendar/keys/reissue", () => {
  let app: Hono<AppEnv>;
  let ctx: ReturnType<typeof createReissueEnv>;

  beforeEach(() => {
    app = new Hono<AppEnv>();
    app.route("/api/v1/calendar/keys", keysReissue);
    ctx = createReissueEnv();
  });

  async function seedPerRequest(email: string) {
    const key = "shrb_" + "Z".repeat(32);
    const hash = await sha256Hex(key);
    await ctx.env.API_KEYS.put(
      hash,
      JSON.stringify({
        plan: "pro",
        customerId: "cust_seed",
        stripeCustomerId: "cus_seed",
        email,
        status: "active",
        createdAt: "2026-06-01T00:00:00.000Z",
      })
    );
    await ctx.env.USAGE_LOGS.put(`${EMAIL_INDEX_PREFIX}${email}`, hash);
    return { key, hash };
  }

  it("JSON: 該当なしでも 200 汎用メッセージ(存在を漏らさない)+ 送信なし", async () => {
    const res = await app.request(
      "/api/v1/calendar/keys/reissue",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nobody@example.com" }),
      },
      ctx.env
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { message: string };
    expect(json.message).toBeTruthy();
    expect(ctx.sent.length).toBe(0);
  });

  it("JSON: 該当ありで 200 + 検証メール送信(同一汎用メッセージ)", async () => {
    await seedPerRequest("paid@example.com");
    const res = await app.request(
      "/api/v1/calendar/keys/reissue",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "paid@example.com" }),
      },
      ctx.env
    );
    expect(res.status).toBe(200);
    expect(ctx.sent.length).toBe(1);
    expect(ctx.sent[0].to).toBe("paid@example.com");
    expect(tokenFromMail(ctx.sent[0])).toMatch(/^[0-9a-f]{64}$/);
  });

  it("JSON: 不正な email は 400", async () => {
    const res = await app.request(
      "/api/v1/calendar/keys/reissue",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      },
      ctx.env
    );
    expect(res.status).toBe(400);
    expect(ctx.sent.length).toBe(0);
  });

  it("form-urlencoded: 該当ありで 200 HTML を返し送信する", async () => {
    await seedPerRequest("form@example.com");
    const res = await app.request(
      "/api/v1/calendar/keys/reissue",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "email=form%40example.com",
      },
      ctx.env
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(ctx.sent.length).toBe(1);
  });

  it("end-to-end: 受付 → メールの token → 確定回転で新キーが発行される", async () => {
    const email = "e2e@example.com";
    const seeded = await seedPerRequest(email);

    await app.request(
      "/api/v1/calendar/keys/reissue",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      },
      ctx.env
    );
    expect(ctx.sent.length).toBe(1);
    const token = tokenFromMail(ctx.sent[0]);

    // 確定(index.ts の POST /keys/reissue/confirm 相当)
    const record = await consumeReissueToken(ctx.env.USAGE_LOGS, token);
    expect(record).not.toBeNull();
    const newKey = await rotateByToken(ctx.env.API_KEYS, ctx.env.USAGE_LOGS, record!);
    expect(newKey).toMatch(/^shrb_[a-zA-Z0-9]{32}$/);

    // 旧キー失効・新キー有効
    expect(await ctx.env.API_KEYS.get(seeded.hash)).toBeNull();
    const newHash = await sha256Hex(newKey!);
    expect(await ctx.env.API_KEYS.get(newHash)).toBeTruthy();
    // email 索引は新ハッシュ
    expect(await ctx.env.USAGE_LOGS.get(`${EMAIL_INDEX_PREFIX}${email}`)).toBe(newHash);
    // トークンは single-use(再消費不可)
    expect(await consumeReissueToken(ctx.env.USAGE_LOGS, token)).toBeNull();
  });
});
