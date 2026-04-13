/**
 * Stripe利用量報告のテスト
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  collectDailyUsage,
  reportToStripe,
  runDailyReport,
} from "../../src/billing/stripe-reporter.js";
import { MockKV } from "../helpers/mock-kv.js";

describe("collectDailyUsage", () => {
  let usageKV: MockKV;

  beforeEach(() => {
    usageKV = new MockKV();
  });

  it("指定日の利用量を集計する", async () => {
    const date = "2026-04-12";
    // インデックスに顧客を登録
    await usageKV.put(`usage-index:${date}`, "cust_a,cust_b");
    await usageKV.put(`usage:cust_a:${date}`, "150");
    await usageKV.put(`usage:cust_b:${date}`, "300");

    const entries = await collectDailyUsage(usageKV as unknown as KVNamespace, date);

    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.customerId === "cust_a")?.count).toBe(150);
    expect(entries.find((e) => e.customerId === "cust_b")?.count).toBe(300);
  });

  it("利用がない日は空配列を返す", async () => {
    const entries = await collectDailyUsage(usageKV as unknown as KVNamespace, "2026-04-12");
    expect(entries).toHaveLength(0);
  });

  it("カウント0の顧客はスキップする", async () => {
    const date = "2026-04-12";
    await usageKV.put(`usage-index:${date}`, "cust_a,cust_b");
    await usageKV.put(`usage:cust_a:${date}`, "100");
    await usageKV.put(`usage:cust_b:${date}`, "0");

    const entries = await collectDailyUsage(usageKV as unknown as KVNamespace, date);
    expect(entries).toHaveLength(1);
    expect(entries[0].customerId).toBe("cust_a");
  });
});

describe("reportToStripe", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("成功時にsuccess: trueを返す", async () => {
    // fetchをモック
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "usage_record_123" }),
    }));

    const result = await reportToStripe(
      "sk_test_xxx",
      "si_abc123",
      100,
      Math.floor(Date.now() / 1000)
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("失敗時にsuccess: falseとエラーメッセージを返す", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('{"error": "bad request"}'),
    }));

    const result = await reportToStripe(
      "sk_test_xxx",
      "si_abc123",
      100,
      Math.floor(Date.now() / 1000)
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Stripe API error");
    expect(result.error).toContain("400");
  });

  it("正しいURLとヘッダーでAPIを呼ぶ", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    await reportToStripe("sk_test_xxx", "si_abc123", 42, 1700000000);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/subscription_items/si_abc123/usage_records",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk_test_xxx",
        }),
      })
    );
  });
});

describe("runDailyReport", () => {
  let usageKV: MockKV;

  beforeEach(() => {
    usageKV = new MockKV();
    vi.restoreAllMocks();
  });

  it("全顧客の利用量を報告する", async () => {
    const date = "2026-04-12";
    await usageKV.put(`usage-index:${date}`, "cust_a,cust_b");
    await usageKV.put(`usage:cust_a:${date}`, "100");
    await usageKV.put(`usage:cust_b:${date}`, "200");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }));

    const results = await runDailyReport(
      usageKV as unknown as KVNamespace,
      "sk_test_xxx",
      {
        cust_a: { subscriptionItemId: "si_a" },
        cust_b: { subscriptionItemId: "si_b" },
      },
      date
    );

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it("マッピングがない顧客はエラーとして報告する", async () => {
    const date = "2026-04-12";
    await usageKV.put(`usage-index:${date}`, "cust_unknown");
    await usageKV.put(`usage:cust_unknown:${date}`, "50");

    const results = await runDailyReport(
      usageKV as unknown as KVNamespace,
      "sk_test_xxx",
      {}, // マッピングなし
      date
    );

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("No subscription item mapping");
  });
});
