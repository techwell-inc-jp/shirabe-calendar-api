/**
 * self-serve キー再発行 — リクエスト受付ルート
 *
 * POST /api/v1/calendar/keys/reissue   { email }
 *   - JSON でも form-urlencoded でも受け付ける(AI-callable + ブラウザフォーム両対応)。
 *   - anti-enumeration: 契約有無に関わらず常に同一の汎用レスポンスを返す。
 *   - 有効な契約がある場合のみ、ワンタイムトークンを発行し登録メールへ検証リンクを送る。
 *   - 認証ミドルウェアはバイパス(index.ts で /api/* middleware より前に登録)。
 *
 * 実際のキー回転は検証リンクのページ(GET/POST /keys/reissue/confirm、index.ts)で行う。
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/env.js";
import {
  generateReissueToken,
  putReissueToken,
  resolveReissueTarget,
} from "../keys/reissue-store.js";
import { sendReissueEmail } from "../util/email.js";
import { renderReissueRequestedPage, renderReissueFormPage } from "../pages/keys-reissue.js";

/** メールアドレスの簡易バリデーション(checkout.ts と同一)。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 確定ページのベース URL。 */
const CONFIRM_BASE_URL = "https://shirabe.dev/keys/reissue/confirm";

/** anti-enumeration の汎用メッセージ(JSON 応答用)。 */
const GENERIC_MESSAGE =
  "If a matching subscription exists, a reissue confirmation link has been sent to the registered email address.";

const keysReissue = new Hono<AppEnv>();

keysReissue.post("/reissue", async (c) => {
  const contentType = c.req.header("content-type") || "";
  const isJson = contentType.includes("application/json");

  let email: string | undefined;
  try {
    if (isJson) {
      const body = (await c.req.json()) as { email?: unknown };
      email = typeof body.email === "string" ? body.email : undefined;
    } else {
      const form = await c.req.parseBody();
      email = typeof form.email === "string" ? form.email : undefined;
    }
  } catch {
    // パース失敗は下のバリデーションで処理。
  }

  const trimmed = email?.trim();
  if (!trimmed || !EMAIL_PATTERN.test(trimmed)) {
    if (isJson) {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "A valid email address is required.",
          },
        },
        400
      );
    }
    return c.html(renderReissueFormPage("有効なメールアドレスを入力してください。"), 400);
  }

  // 解決 + 送信は best-effort。例外でも汎用レスポンスに倒す(存在を漏らさない)。
  try {
    const target = await resolveReissueTarget(c.env.USAGE_LOGS, trimmed);
    if (target) {
      const token = generateReissueToken();
      await putReissueToken(c.env.USAGE_LOGS, token, {
        kind: target.kind,
        ref: target.ref,
        email: trimmed,
        createdAt: new Date().toISOString(),
      });
      const confirmUrl = `${CONFIRM_BASE_URL}?token=${token}`;
      await sendReissueEmail(c.env, trimmed, confirmUrl);
    }
  } catch (err) {
    console.error("[reissue] request handling failed", err);
  }

  if (isJson) {
    return c.json({ message: GENERIC_MESSAGE });
  }
  return c.html(renderReissueRequestedPage());
});

export { keysReissue };
