/**
 * scripts/stripe-daily-report.ts の単体テスト
 *
 * 観点:
 * - 匿名ユーザー(anon_*)は正常スキップ(failed扱いしない)
 * - マッピング未登録 cust_* は警告スキップ(failed扱いしない)
 * - Stripe API 実エラー時のみ exit code 1 を返す
 * - 混在パターンで各分類が正しく適用される
 * - `reportToStripe` の HTTP 成功/失敗
 */
import { describe, it, expect, vi } from "vitest";
import {
  processEntries,
  summarizeAndDecideExitCode,
  reportToStripe,
  type UsageEntry,
  type CustomerStripeMap,
  type ReportResult,
} from "../../scripts/stripe-daily-report.js";

// ---------------------------------------------------------------------------
// processEntries — 分類ロジック
// ---------------------------------------------------------------------------

describe("processEntries", () => {
  const timestamp = 1767225600;
  const stripeKey = "sk_test_xxx";
  const eventName = "api_requests";

  it("anon_* は Stripe 報告をスキップし skipped_anonymous になる", async () => {
    const entries: UsageEntry[] = [
      { customerId: "anon_abc123", count: 5 },
      { customerId: "anon_def456", count: 2 },
    ];
    const reportMock = vi.fn();
    const results = await processEntries(entries, {}, stripeKey, eventName, timestamp, {
      reportToStripe: reportMock as unknown as typeof reportToStripe,
    });

    expect(results.every((r) => r.status === "skipped_anonymous")).toBe(true);
    expect(reportMock).not.toHaveBeenCalled();
  });

  it("cust_* でマップに無い顧客は skipped_unmapped(失敗扱いではない)", async () => {
    const entries: UsageEntry[] = [{ customerId: "cust_cancelled", count: 10 }];
    const reportMock = vi.fn();
    const results = await processEntries(entries, {}, stripeKey, eventName, timestamp, {
      reportToStripe: reportMock as unknown as typeof reportToStripe,
    });

    expect(results[0].status).toBe("skipped_unmapped");
    expect(results[0].error).toBeUndefined();
    expect(reportMock).not.toHaveBeenCalled();
  });

  it("cust_* でマップに登録済み + Stripe成功 → reported", async () => {
    const entries: UsageEntry[] = [{ customerId: "cust_active", count: 100 }];
    const customerMap: CustomerStripeMap = {
      cust_active: { stripeCustomerId: "cus_stripe_abc" },
    };
    const reportMock = vi.fn(async () => ({ success: true }));
    const results = await processEntries(
      entries,
      customerMap,
      stripeKey,
      eventName,
      timestamp,
      { reportToStripe: reportMock as unknown as typeof reportToStripe }
    );

    expect(results[0].status).toBe("reported");
    expect(reportMock).toHaveBeenCalledOnce();
    expect(reportMock).toHaveBeenCalledWith(
      stripeKey,
      "cus_stripe_abc",
      eventName,
      100,
      timestamp
    );
  });

  it("cust_* でマップ登録済みだが Stripe APIエラー → stripe_error", async () => {
    const entries: UsageEntry[] = [{ customerId: "cust_a", count: 50 }];
    const customerMap: CustomerStripeMap = {
      cust_a: { stripeCustomerId: "cus_x" },
    };
    const reportMock = vi.fn(async () => ({
      success: false,
      error: "Stripe API error 400: bad request",
    }));
    const results = await processEntries(
      entries,
      customerMap,
      stripeKey,
      eventName,
      timestamp,
      { reportToStripe: reportMock as unknown as typeof reportToStripe }
    );

    expect(results[0].status).toBe("stripe_error");
    expect(results[0].error).toContain("400");
  });

  it("匿名/未登録/成功/Stripeエラー の混在が正しく分類される", async () => {
    const entries: UsageEntry[] = [
      { customerId: "anon_a", count: 1 },
      { customerId: "cust_cancelled", count: 2 },
      { customerId: "cust_active", count: 3 },
      { customerId: "cust_broken", count: 4 },
    ];
    const customerMap: CustomerStripeMap = {
      cust_active: { stripeCustomerId: "cus_ok" },
      cust_broken: { stripeCustomerId: "cus_err" },
    };
    const reportMock = vi.fn(async (_key: string, custId: string) => {
      return custId === "cus_ok"
        ? { success: true }
        : { success: false, error: "Stripe API error 500: boom" };
    });
    const results = await processEntries(
      entries,
      customerMap,
      stripeKey,
      eventName,
      timestamp,
      { reportToStripe: reportMock as unknown as typeof reportToStripe }
    );

    expect(results[0].status).toBe("skipped_anonymous");
    expect(results[1].status).toBe("skipped_unmapped");
    expect(results[2].status).toBe("reported");
    expect(results[3].status).toBe("stripe_error");
  });
});

// ---------------------------------------------------------------------------
// summarizeAndDecideExitCode — 終了コード決定
// ---------------------------------------------------------------------------

describe("summarizeAndDecideExitCode", () => {
  function makeLogger() {
    return {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  }

  it("reported のみ → exit 0", () => {
    const results: ReportResult[] = [
      { customerId: "cust_a", count: 10, status: "reported" },
    ];
    expect(summarizeAndDecideExitCode(results, makeLogger())).toBe(0);
  });

  it("skipped_anonymous のみ → exit 0 (4/18 失敗シナリオの修正確認)", () => {
    const results: ReportResult[] = [
      { customerId: "anon_a", count: 1, status: "skipped_anonymous" },
      { customerId: "anon_b", count: 2, status: "skipped_anonymous" },
    ];
    const logger = makeLogger();
    expect(summarizeAndDecideExitCode(results, logger)).toBe(0);
    // anon は INFO で要約出力される
    expect(logger.log.mock.calls.some((c) => c[0].includes("Skipped 2 anonymous"))).toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("skipped_unmapped のみ → exit 0、WARN ログが出る", () => {
    const results: ReportResult[] = [
      { customerId: "cust_cancelled", count: 5, status: "skipped_unmapped" },
    ];
    const logger = makeLogger();
    expect(summarizeAndDecideExitCode(results, logger)).toBe(0);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0][0]).toContain("cust_cancelled");
    expect(logger.warn.mock.calls[0][0]).toContain("cancelled");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("skipped + reported の混在 → exit 0", () => {
    const results: ReportResult[] = [
      { customerId: "anon_x", count: 1, status: "skipped_anonymous" },
      { customerId: "cust_cancel", count: 2, status: "skipped_unmapped" },
      { customerId: "cust_ok", count: 3, status: "reported" },
    ];
    expect(summarizeAndDecideExitCode(results, makeLogger())).toBe(0);
  });

  it("stripe_error が1件でもあれば exit 1", () => {
    const results: ReportResult[] = [
      { customerId: "anon_x", count: 1, status: "skipped_anonymous" },
      { customerId: "cust_ok", count: 3, status: "reported" },
      {
        customerId: "cust_bad",
        count: 4,
        status: "stripe_error",
        error: "Stripe API error 500",
      },
    ];
    const logger = makeLogger();
    expect(summarizeAndDecideExitCode(results, logger)).toBe(1);
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error.mock.calls[0][0]).toContain("cust_bad");
    expect(logger.error.mock.calls[0][0]).toContain("500");
  });

  it("entries 0件(results空) → exit 0", () => {
    expect(summarizeAndDecideExitCode([], makeLogger())).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// reportToStripe — Stripe Meter Events API 呼出の HTTP 層
// ---------------------------------------------------------------------------

describe("reportToStripe (Meter Events)", () => {
  it("成功時に success: true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "",
      })
    );
    const r = await reportToStripe("sk_test", "cus_x", "api_requests", 10, 1700000000);
    expect(r.success).toBe(true);
    vi.unstubAllGlobals();
  });

  it("4xx エラー時に success: false + error に status を含む", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => '{"error":"bad meter"}',
      })
    );
    const r = await reportToStripe("sk_test", "cus_x", "api_requests", 10, 1700000000);
    expect(r.success).toBe(false);
    expect(r.error).toContain("400");
    vi.unstubAllGlobals();
  });

  it("Meter Events エンドポイントと payload 形式で呼ばれる", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    vi.stubGlobal("fetch", mockFetch);

    await reportToStripe("sk_test_abc", "cus_y", "api_requests", 42, 1700000000);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.stripe.com/v1/billing/meter_events");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_abc");
    const body = String(init.body);
    expect(body).toContain("event_name=api_requests");
    expect(body).toContain("payload%5Bvalue%5D=42");
    expect(body).toContain("payload%5Bstripe_customer_id%5D=cus_y");
    expect(body).toContain("timestamp=1700000000");

    vi.unstubAllGlobals();
  });
});
