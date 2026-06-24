/**
 * Email Sending 送信ユーティリティのテスト
 */
import { describe, it, expect, vi } from "vitest";
import {
  buildReissueEmail,
  sendReissueEmail,
  REISSUE_FROM_EMAIL,
} from "../../src/util/email.js";
import type { Env, EmailSendMessage } from "../../src/types/env.js";

describe("buildReissueEmail", () => {
  const url = "https://shirabe.dev/keys/reissue/confirm?token=abc123";

  it("件名・text・html を返す", () => {
    const mail = buildReissueEmail(url);
    expect(mail.subject).toContain("再発行");
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(url);
  });

  it("text / html とも確認 URL を含む(クライアント差異対策)", () => {
    const mail = buildReissueEmail(url);
    expect(mail.text.includes(url)).toBe(true);
    expect(mail.html.includes(url)).toBe(true);
  });
});

describe("sendReissueEmail", () => {
  function envWith(emailMock?: Env["EMAIL"]): Env {
    return { EMAIL: emailMock } as unknown as Env;
  }

  it("EMAIL binding 未設定なら false(送信スキップ)", async () => {
    const ok = await sendReissueEmail(envWith(undefined), "u@example.com", "https://x");
    expect(ok).toBe(false);
  });

  it("送信成功で true、from は noreply@shirabe.dev", async () => {
    let captured: EmailSendMessage | undefined;
    const send = vi.fn(async (m: EmailSendMessage) => {
      captured = m;
      return {};
    });
    const ok = await sendReissueEmail(envWith({ send }), "u@example.com", "https://x/confirm");
    expect(ok).toBe(true);
    expect(send).toHaveBeenCalledOnce();
    expect(captured!.to).toBe("u@example.com");
    expect(captured!.from.email).toBe(REISSUE_FROM_EMAIL);
    expect(captured!.text).toContain("https://x/confirm");
  });

  it("送信が throw しても false(フローを壊さない)", async () => {
    const send = vi.fn(async () => {
      throw new Error("send failed");
    });
    const ok = await sendReissueEmail(envWith({ send }), "u@example.com", "https://x");
    expect(ok).toBe(false);
  });
});
