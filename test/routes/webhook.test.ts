/**
 * Phase 4: Stripe Webhook自動処理のテスト
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { webhook, verifyStripeSignature } from "../../src/routes/webhook.js";
import type { ApiKeyInfo } from "../../src/middleware/auth.js";
import type { AggregatedApiKeyInfo } from "../../src/types/api-key.js";
import type { AppEnv } from "../../src/types/env.js";
import { createMockEnv } from "../helpers/mock-kv.js";

const WEBHOOK_SECRET = "whsec_test_secret_for_testing";

/** テスト用 env */
function createWebhookEnv() {
  const env = createMockEnv();
  return {
    ...env,
    STRIPE_SECRET_KEY: "sk_test_fake",
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  };
}

/** HMAC SHA-256 で Stripe 署名を計算する */
async function signPayload(payload: string, secret: string, timestamp?: number): Promise<string> {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${ts}.${payload}`));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `t=${ts},v1=${hex}`;
}

/** Stripe Webhook リクエストを組み立てて送信するヘルパー */
async function sendWebhook(
  app: Hono<AppEnv>,
  env: ReturnType<typeof createWebhookEnv>,
  event: any,
  secret?: string
) {
  const body = JSON.stringify(event);
  const sigHeader = await signPayload(body, secret ?? WEBHOOK_SECRET);
  const res = await app.fetch(
    new Request("http://localhost/webhook/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": sigHeader,
      },
      body,
    }),
    env
  );
  return res;
}

// ─── 署名検証 ───────────────────────────────────────────

describe("verifyStripeSignature", () => {
  const secret = "whsec_abc";
  const payload = '{"type":"test"}';

  it("正しい署名で true を返す", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = await signPayload(payload, secret, ts);
    const result = await verifyStripeSignature(payload, header, secret);
    expect(result).toBe(true);
  });

  it("不正な署名で false を返す", async () => {
    const result = await verifyStripeSignature(payload, "t=123,v1=deadbeef", secret);
    expect(result).toBe(false);
  });

  it("期限切れ（5分以上前）のタイムスタンプで false を返す", async () => {
    const oldTs = Math.floor(Date.now() / 1000) - 400;
    const header = await signPayload(payload, secret, oldTs);
    const result = await verifyStripeSignature(payload, header, secret);
    expect(result).toBe(false);
  });

  it("Stripe-Signature ヘッダーが空で false を返す", async () => {
    const result = await verifyStripeSignature(payload, "", secret);
    expect(result).toBe(false);
  });
});

// ─── Webhook エンドポイント ────────────────────────────────────

describe("POST /webhook/stripe", () => {
  let app: Hono<AppEnv>;
  let env: ReturnType<typeof createWebhookEnv>;

  beforeEach(() => {
    env = createWebhookEnv();
    app = new Hono<AppEnv>();
    app.route("/webhook/stripe", webhook);
  });

  it("Stripe-Signature ヘッダーなしで 401 を返す", async () => {
    const res = await app.fetch(
      new Request("http://localhost/webhook/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"type":"test"}',
      }),
      env
    );
    expect(res.status).toBe(401);
  });

  it("不正な署名で 401 を返す", async () => {
    const res = await app.fetch(
      new Request("http://localhost/webhook/stripe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": "t=123,v1=invalid",
        },
        body: '{"type":"test"}',
      }),
      env
    );
    expect(res.status).toBe(401);
  });

  it("STRIPE_WEBHOOK_SECRET 未設定で 500 を返す", async () => {
    const noSecretEnv = { ...env, STRIPE_WEBHOOK_SECRET: undefined };
    const res = await app.fetch(
      new Request("http://localhost/webhook/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"type":"test"}',
      }),
      noSecretEnv
    );
    expect(res.status).toBe(500);
  });

  it("未対応イベントは 200 + received:true を返す", async () => {
    const res = await sendWebhook(app, env, { type: "unknown.event", data: {} });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.received).toBe(true);
  });

  // ─── checkout.session.completed ────────────────────────

  describe("checkout.session.completed", () => {
    const apiKeyHash = "abc123def456abc123def456abc123def456abc123def456abc123def456abcd";
    const pendingData = {
      apiKey: "shrb_TestKeyAAAAAAAAAAAAAAAAAAAAAAAA",
      plan: "starter",
      email: "user@example.com",
    };

    beforeEach(async () => {
      await env.USAGE_LOGS.put(
        `checkout-pending:${apiKeyHash}`,
        JSON.stringify(pendingData)
      );
    });

    it("KV API_KEYS にエントリが作成される", async () => {
      const event = {
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { apiKeyHash, plan: "starter" },
            customer: "cus_test123",
            subscription: "sub_test123",
          },
        },
      };

      const res = await sendWebhook(app, env, event);
      expect(res.status).toBe(200);

      const keyInfoStr = await env.API_KEYS.get(apiKeyHash);
      expect(keyInfoStr).not.toBeNull();
      const keyInfo: ApiKeyInfo = JSON.parse(keyInfoStr!);
      expect(keyInfo.plan).toBe("starter");
      expect(keyInfo.customerId).toBe(`cust_${apiKeyHash.slice(0, 16)}`);
      expect(keyInfo.stripeCustomerId).toBe("cus_test123");
      expect(keyInfo.stripeSubscriptionId).toBe("sub_test123");
      expect(keyInfo.email).toBe("user@example.com");
      expect(keyInfo.status).toBe("active");
      expect(keyInfo.createdAt).toBeTruthy();
    });

    it("stripe:customer-map が更新される", async () => {
      const event = {
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { apiKeyHash, plan: "starter" },
            customer: "cus_test123",
            subscription: "sub_test123",
          },
        },
      };

      await sendWebhook(app, env, event);

      const mapStr = await env.USAGE_LOGS.get("stripe:customer-map");
      expect(mapStr).not.toBeNull();
      const map = JSON.parse(mapStr!);
      const customerId = `cust_${apiKeyHash.slice(0, 16)}`;
      expect(map[customerId]).toEqual({ stripeCustomerId: "cus_test123" });
    });

    it("stripe-reverse マッピングが作成される", async () => {
      const event = {
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { apiKeyHash, plan: "pro" },
            customer: "cus_rev",
            subscription: "sub_rev",
          },
        },
      };

      await sendWebhook(app, env, event);

      const reverse = await env.USAGE_LOGS.get("stripe-reverse:cus_rev");
      expect(reverse).not.toBeNull();
      const customerId = `cust_${apiKeyHash.slice(0, 16)}`;
      expect(reverse).toBe(`${customerId},${apiKeyHash}`);
    });

    it("email マッピングが作成される", async () => {
      const event = {
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { apiKeyHash, plan: "starter" },
            customer: "cus_email",
            subscription: "sub_email",
          },
        },
      };

      await sendWebhook(app, env, event);

      const emailMapping = await env.USAGE_LOGS.get("email:user@example.com");
      expect(emailMapping).toBe(apiKeyHash);
    });

    it("checkout-pending は削除されず残る（/checkout/success ページとの競合回避のため）", async () => {
      const event = {
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { apiKeyHash, plan: "starter" },
            customer: "cus_del",
            subscription: "sub_del",
          },
        },
      };

      await sendWebhook(app, env, event);

      // Webhook は pending を削除しない。TTL 1時間で自動失効する前提。
      const pending = await env.USAGE_LOGS.get(`checkout-pending:${apiKeyHash}`);
      expect(pending).not.toBeNull();
      const parsed = JSON.parse(pending!);
      expect(parsed.apiKey).toBe(pendingData.apiKey);
    });
  });

  // ─── invoice.payment_failed ────────────────────────────

  describe("invoice.payment_failed", () => {
    const apiKeyHash = "hash_payment_fail_test_0000000000000000000000000000000000000000";
    const customerId = "cust_pf";

    beforeEach(async () => {
      const keyInfo: ApiKeyInfo = {
        plan: "starter",
        customerId,
        stripeCustomerId: "cus_pf",
        status: "active",
        createdAt: "2026-01-01T00:00:00Z",
      };
      await env.API_KEYS.put(apiKeyHash, JSON.stringify(keyInfo));
      await env.USAGE_LOGS.put("stripe-reverse:cus_pf", `${customerId},${apiKeyHash}`);
    });

    it("status が suspended に変更される", async () => {
      const event = {
        type: "invoice.payment_failed",
        data: { object: { customer: "cus_pf" } },
      };

      const res = await sendWebhook(app, env, event);
      expect(res.status).toBe(200);

      const keyInfoStr = await env.API_KEYS.get(apiKeyHash);
      const keyInfo: ApiKeyInfo = JSON.parse(keyInfoStr!);
      expect(keyInfo.status).toBe("suspended");
    });
  });

  // ─── invoice.payment_succeeded ─────────────────────────

  describe("invoice.payment_succeeded", () => {
    const apiKeyHash = "hash_payment_succ_test_000000000000000000000000000000000000000";
    const customerId = "cust_ps";

    beforeEach(async () => {
      const keyInfo: ApiKeyInfo = {
        plan: "starter",
        customerId,
        stripeCustomerId: "cus_ps",
        status: "suspended",
        createdAt: "2026-01-01T00:00:00Z",
      };
      await env.API_KEYS.put(apiKeyHash, JSON.stringify(keyInfo));
      await env.USAGE_LOGS.put("stripe-reverse:cus_ps", `${customerId},${apiKeyHash}`);
    });

    it("suspended から active に復帰する", async () => {
      const event = {
        type: "invoice.payment_succeeded",
        data: { object: { customer: "cus_ps" } },
      };

      const res = await sendWebhook(app, env, event);
      expect(res.status).toBe(200);

      const keyInfoStr = await env.API_KEYS.get(apiKeyHash);
      const keyInfo: ApiKeyInfo = JSON.parse(keyInfoStr!);
      expect(keyInfo.status).toBe("active");
    });

    it("既に active なら変更しない", async () => {
      // active に戻す
      const keyInfo: ApiKeyInfo = {
        plan: "starter",
        customerId,
        stripeCustomerId: "cus_ps",
        status: "active",
        createdAt: "2026-01-01T00:00:00Z",
      };
      await env.API_KEYS.put(apiKeyHash, JSON.stringify(keyInfo));

      const event = {
        type: "invoice.payment_succeeded",
        data: { object: { customer: "cus_ps" } },
      };

      const res = await sendWebhook(app, env, event);
      expect(res.status).toBe(200);

      const updated = JSON.parse((await env.API_KEYS.get(apiKeyHash))!);
      expect(updated.status).toBe("active");
    });
  });

  // ─── customer.subscription.deleted ──────────────────────

  describe("customer.subscription.deleted", () => {
    const apiKeyHash = "hash_sub_deleted_test_0000000000000000000000000000000000000000";
    const customerId = "cust_sd";

    beforeEach(async () => {
      const keyInfo: ApiKeyInfo = {
        plan: "pro",
        customerId,
        stripeCustomerId: "cus_sd",
        stripeSubscriptionId: "sub_sd",
        status: "active",
        createdAt: "2026-01-01T00:00:00Z",
      };
      await env.API_KEYS.put(apiKeyHash, JSON.stringify(keyInfo));
      await env.USAGE_LOGS.put("stripe-reverse:cus_sd", `${customerId},${apiKeyHash}`);

      const map = { [customerId]: { stripeCustomerId: "cus_sd" } };
      await env.USAGE_LOGS.put("stripe:customer-map", JSON.stringify(map));
    });

    it("plan が free に降格される", async () => {
      const event = {
        type: "customer.subscription.deleted",
        data: { object: { customer: "cus_sd" } },
      };

      const res = await sendWebhook(app, env, event);
      expect(res.status).toBe(200);

      const keyInfoStr = await env.API_KEYS.get(apiKeyHash);
      const keyInfo: ApiKeyInfo = JSON.parse(keyInfoStr!);
      expect(keyInfo.plan).toBe("free");
      expect(keyInfo.status).toBe("active");
    });

    it("stripeCustomerId / stripeSubscriptionId が削除される", async () => {
      const event = {
        type: "customer.subscription.deleted",
        data: { object: { customer: "cus_sd" } },
      };

      await sendWebhook(app, env, event);

      const keyInfo: ApiKeyInfo = JSON.parse((await env.API_KEYS.get(apiKeyHash))!);
      expect(keyInfo.stripeCustomerId).toBeUndefined();
      expect(keyInfo.stripeSubscriptionId).toBeUndefined();
    });

    it("stripe:customer-map から該当エントリが削除される", async () => {
      const event = {
        type: "customer.subscription.deleted",
        data: { object: { customer: "cus_sd" } },
      };

      await sendWebhook(app, env, event);

      const mapStr = await env.USAGE_LOGS.get("stripe:customer-map");
      const map = JSON.parse(mapStr!);
      expect(map[customerId]).toBeUndefined();
    });

    it("stripe-reverse が削除される", async () => {
      const event = {
        type: "customer.subscription.deleted",
        data: { object: { customer: "cus_sd" } },
      };

      await sendWebhook(app, env, event);

      const reverse = await env.USAGE_LOGS.get("stripe-reverse:cus_sd");
      expect(reverse).toBeNull();
    });
  });

  // ─── 新フォーマット (AggregatedApiKeyInfo) との整合性 ────────
  // Issue #27 防御的 patch: 暦 webhook が住所 API などの apis.* 情報を
  // 破壊しないこと、apis.calendar をネスト更新することを確認する。

  describe("新フォーマット (AggregatedApiKeyInfo) との整合性", () => {
    const apiKeyHash = "hash_aggregated_test_0000000000000000000000000000000000000000000";
    const customerId = "cust_aggr";

    describe("checkout.session.completed (既存が住所 API 単独契約の集約フォーマット)", () => {
      const pendingData = {
        apiKey: "shrb_AggrTestKeyAAAAAAAAAAAAAAAAAAAA",
        plan: "pro",
        email: "user@example.com",
      };

      beforeEach(async () => {
        await env.USAGE_LOGS.put(
          `checkout-pending:${apiKeyHash}`,
          JSON.stringify(pendingData)
        );
        // 住所 API が先に契約済み(新フォーマット)
        const existing: AggregatedApiKeyInfo = {
          customerId,
          stripeCustomerId: "cus_existing",
          email: "user@example.com",
          createdAt: "2026-01-01T00:00:00Z",
          apis: {
            address: { plan: "starter", status: "active" },
          },
        };
        await env.API_KEYS.put(apiKeyHash, JSON.stringify(existing));
      });

      it("apis.calendar が追加され、apis.address は保持される", async () => {
        const event = {
          type: "checkout.session.completed",
          data: {
            object: {
              metadata: { apiKeyHash, plan: "pro" },
              customer: "cus_new",
              subscription: "sub_new",
            },
          },
        };

        const res = await sendWebhook(app, env, event);
        expect(res.status).toBe(200);

        const stored = JSON.parse(
          (await env.API_KEYS.get(apiKeyHash))!
        ) as AggregatedApiKeyInfo;
        expect(stored.apis.calendar?.plan).toBe("pro");
        expect(stored.apis.calendar?.status).toBe("active");
        expect(stored.apis.calendar?.stripeSubscriptionId).toBe("sub_new");
        // 住所 API は保持される
        expect(stored.apis.address?.plan).toBe("starter");
        // 旧フォーマットのトップレベル plan は混入しない
        expect((stored as any).plan).toBeUndefined();
      });

      it("stripeCustomerId は新規 customer で上書きされる", async () => {
        const event = {
          type: "checkout.session.completed",
          data: {
            object: {
              metadata: { apiKeyHash, plan: "pro" },
              customer: "cus_new",
              subscription: "sub_new",
            },
          },
        };

        await sendWebhook(app, env, event);
        const stored = JSON.parse(
          (await env.API_KEYS.get(apiKeyHash))!
        ) as AggregatedApiKeyInfo;
        expect(stored.stripeCustomerId).toBe("cus_new");
      });
    });

    describe("invoice.payment_failed (新フォーマットの暦+住所両方契約)", () => {
      beforeEach(async () => {
        const existing: AggregatedApiKeyInfo = {
          customerId,
          stripeCustomerId: "cus_aggr",
          email: "user@example.com",
          createdAt: "2026-01-01T00:00:00Z",
          apis: {
            calendar: { plan: "pro", status: "active" },
            address: { plan: "starter", status: "active" },
          },
        };
        await env.API_KEYS.put(apiKeyHash, JSON.stringify(existing));
        await env.USAGE_LOGS.put(
          "stripe-reverse:cus_aggr",
          `${customerId},${apiKeyHash}`
        );
      });

      it("apis.calendar.status のみ suspended になり、apis.address は変わらない", async () => {
        const event = {
          type: "invoice.payment_failed",
          data: { object: { customer: "cus_aggr" } },
        };

        const res = await sendWebhook(app, env, event);
        expect(res.status).toBe(200);

        const stored = JSON.parse(
          (await env.API_KEYS.get(apiKeyHash))!
        ) as AggregatedApiKeyInfo;
        expect(stored.apis.calendar?.status).toBe("suspended");
        expect(stored.apis.address?.status).toBe("active");
        // 旧フォーマットのトップレベル status は混入しない
        expect((stored as any).status).toBeUndefined();
      });
    });

    describe("invoice.payment_succeeded (新フォーマットの暦が suspended)", () => {
      beforeEach(async () => {
        const existing: AggregatedApiKeyInfo = {
          customerId,
          stripeCustomerId: "cus_aggr",
          email: "user@example.com",
          createdAt: "2026-01-01T00:00:00Z",
          apis: {
            calendar: { plan: "pro", status: "suspended" },
            address: { plan: "starter", status: "active" },
          },
        };
        await env.API_KEYS.put(apiKeyHash, JSON.stringify(existing));
        await env.USAGE_LOGS.put(
          "stripe-reverse:cus_aggr",
          `${customerId},${apiKeyHash}`
        );
      });

      it("apis.calendar.status のみ active に復帰、apis.address は保持", async () => {
        const event = {
          type: "invoice.payment_succeeded",
          data: { object: { customer: "cus_aggr" } },
        };

        const res = await sendWebhook(app, env, event);
        expect(res.status).toBe(200);

        const stored = JSON.parse(
          (await env.API_KEYS.get(apiKeyHash))!
        ) as AggregatedApiKeyInfo;
        expect(stored.apis.calendar?.status).toBe("active");
        expect(stored.apis.address?.status).toBe("active");
        expect(stored.apis.address?.plan).toBe("starter");
      });
    });

    describe("customer.subscription.deleted (★ Issue #27 主要 bug、新フォーマット)", () => {
      it("暦+住所両方契約: 暦解約で apis.calendar.plan='free'、apis.address は有償継続、stripe binding 保持", async () => {
        const existing: AggregatedApiKeyInfo = {
          customerId,
          stripeCustomerId: "cus_aggr",
          email: "user@example.com",
          createdAt: "2026-01-01T00:00:00Z",
          apis: {
            calendar: { plan: "pro", status: "active", stripeSubscriptionId: "sub_cal" },
            address: { plan: "starter", status: "active", stripeSubscriptionId: "sub_addr" },
          },
        };
        await env.API_KEYS.put(apiKeyHash, JSON.stringify(existing));
        await env.USAGE_LOGS.put(
          "stripe-reverse:cus_aggr",
          `${customerId},${apiKeyHash}`
        );
        const map = { [customerId]: { stripeCustomerId: "cus_aggr" } };
        await env.USAGE_LOGS.put("stripe:customer-map", JSON.stringify(map));

        const event = {
          type: "customer.subscription.deleted",
          data: { object: { customer: "cus_aggr" } },
        };
        const res = await sendWebhook(app, env, event);
        expect(res.status).toBe(200);

        // apis.calendar が free 化
        const stored = JSON.parse(
          (await env.API_KEYS.get(apiKeyHash))!
        ) as AggregatedApiKeyInfo;
        expect(stored.apis.calendar?.plan).toBe("free");
        expect(stored.apis.calendar?.status).toBe("active");
        // 住所 API は保持
        expect(stored.apis.address?.plan).toBe("starter");
        expect(stored.apis.address?.status).toBe("active");
        // stripeCustomerId は保持(住所が継続使用)
        expect(stored.stripeCustomerId).toBe("cus_aggr");
        // 旧フォーマットのトップレベル plan/status は混入しない
        expect((stored as any).plan).toBeUndefined();

        // stripe-reverse / customer-map も保持(住所 API が継続使用)
        const reverse = await env.USAGE_LOGS.get("stripe-reverse:cus_aggr");
        expect(reverse).not.toBeNull();
        const mapStr = await env.USAGE_LOGS.get("stripe:customer-map");
        const updatedMap = JSON.parse(mapStr!);
        expect(updatedMap[customerId]).toBeDefined();
      });

      it("暦単独契約(住所未契約)の新フォーマット: 暦解約で stripeCustomerId / stripe-reverse / customer-map も削除", async () => {
        const existing: AggregatedApiKeyInfo = {
          customerId,
          stripeCustomerId: "cus_aggr_solo",
          email: "user@example.com",
          createdAt: "2026-01-01T00:00:00Z",
          apis: {
            calendar: { plan: "pro", status: "active", stripeSubscriptionId: "sub_cal" },
          },
        };
        await env.API_KEYS.put(apiKeyHash, JSON.stringify(existing));
        await env.USAGE_LOGS.put(
          "stripe-reverse:cus_aggr_solo",
          `${customerId},${apiKeyHash}`
        );
        const map = { [customerId]: { stripeCustomerId: "cus_aggr_solo" } };
        await env.USAGE_LOGS.put("stripe:customer-map", JSON.stringify(map));

        const event = {
          type: "customer.subscription.deleted",
          data: { object: { customer: "cus_aggr_solo" } },
        };
        await sendWebhook(app, env, event);

        const stored = JSON.parse(
          (await env.API_KEYS.get(apiKeyHash))!
        ) as AggregatedApiKeyInfo;
        expect(stored.apis.calendar?.plan).toBe("free");
        // stripeCustomerId は削除される(他に有償 API なし)
        expect(stored.stripeCustomerId).toBeUndefined();

        // stripe-reverse / customer-map も削除
        const reverse = await env.USAGE_LOGS.get("stripe-reverse:cus_aggr_solo");
        expect(reverse).toBeNull();
        const mapStr = await env.USAGE_LOGS.get("stripe:customer-map");
        const updatedMap = JSON.parse(mapStr!);
        expect(updatedMap[customerId]).toBeUndefined();
      });

      it("住所のみ Free + 暦 Pro の新フォーマット: 暦解約で stripe binding 削除(全 API が free 化)", async () => {
        const existing: AggregatedApiKeyInfo = {
          customerId,
          stripeCustomerId: "cus_aggr_mixed",
          email: "user@example.com",
          createdAt: "2026-01-01T00:00:00Z",
          apis: {
            calendar: { plan: "pro", status: "active", stripeSubscriptionId: "sub_cal" },
            address: { plan: "free", status: "active" },
          },
        };
        await env.API_KEYS.put(apiKeyHash, JSON.stringify(existing));
        await env.USAGE_LOGS.put(
          "stripe-reverse:cus_aggr_mixed",
          `${customerId},${apiKeyHash}`
        );
        const map = { [customerId]: { stripeCustomerId: "cus_aggr_mixed" } };
        await env.USAGE_LOGS.put("stripe:customer-map", JSON.stringify(map));

        const event = {
          type: "customer.subscription.deleted",
          data: { object: { customer: "cus_aggr_mixed" } },
        };
        await sendWebhook(app, env, event);

        const stored = JSON.parse(
          (await env.API_KEYS.get(apiKeyHash))!
        ) as AggregatedApiKeyInfo;
        expect(stored.apis.calendar?.plan).toBe("free");
        expect(stored.apis.address?.plan).toBe("free");
        // 全 API が free → stripe binding 削除
        expect(stored.stripeCustomerId).toBeUndefined();
        const reverse = await env.USAGE_LOGS.get(
          "stripe-reverse:cus_aggr_mixed"
        );
        expect(reverse).toBeNull();
      });
    });
  });
});
