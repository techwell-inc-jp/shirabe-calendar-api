/**
 * Hub license 決済完了ページのテスト(#19 Stripe part)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveLicenseKeyFromSession,
  renderLicenseSuccessPage,
} from "../../src/pages/license-success.js";
import { putLicensePending } from "../../src/licensing/license-checkout.js";
import { MockKV } from "../helpers/mock-kv.js";

describe("resolveLicenseKeyFromSession", () => {
  afterEach(() => vi.restoreAllMocks());

  it("session metadata → pending から license key を取得する", async () => {
    const kv = new MockKV() as unknown as KVNamespace;
    await putLicensePending(kv, "hash9", {
      licenseKey: "shrb_lic_" + "z".repeat(32),
      sku: "hub_pro",
      email: "ops@example.com",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ metadata: { licenseKeyHash: "hash9", sku: "hub_pro" } }), {
          status: 200,
        })
      )
    );

    const r = await resolveLicenseKeyFromSession("cs_1", "sk_test", kv);
    expect(r.licenseKey).toBe("shrb_lic_" + "z".repeat(32));
    expect(r.sku).toBe("hub_pro");
  });

  it("session_id / secret / kv が無ければ空", async () => {
    const kv = new MockKV() as unknown as KVNamespace;
    expect(await resolveLicenseKeyFromSession(undefined, "sk", kv)).toEqual({ licenseKey: null, sku: null });
    expect(await resolveLicenseKeyFromSession("cs", undefined, kv)).toEqual({ licenseKey: null, sku: null });
    expect(await resolveLicenseKeyFromSession("cs", "sk", undefined)).toEqual({ licenseKey: null, sku: null });
  });

  it("pending 未存在は空", async () => {
    const kv = new MockKV() as unknown as KVNamespace;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ metadata: { licenseKeyHash: "nope" } }), { status: 200 })
      )
    );
    expect(await resolveLicenseKeyFromSession("cs", "sk", kv)).toEqual({ licenseKey: null, sku: null });
  });

  it("Stripe session 取得失敗は空", async () => {
    const kv = new MockKV() as unknown as KVNamespace;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("err", { status: 404 })));
    expect(await resolveLicenseKeyFromSession("cs", "sk", kv)).toEqual({ licenseKey: null, sku: null });
  });
});

describe("renderLicenseSuccessPage", () => {
  it("license key があれば表示し、SKU も出す", () => {
    const html = renderLicenseSuccessPage("cs_1", {
      licenseKey: "shrb_lic_" + "a".repeat(32),
      sku: "hub_pro",
    });
    expect(html).toContain("shrb_lic_" + "a".repeat(32));
    expect(html).toContain("hub_pro");
    expect(html).toContain("ライセンスキー");
  });

  it("license key が無ければ placeholder を出す", () => {
    const html = renderLicenseSuccessPage("cs_1", { licenseKey: null, sku: null });
    expect(html).toContain("shrb_lic_XXXX");
    expect(html).not.toContain("shrb_lic_aaaa");
  });

  it("HTML エスケープされる(XSS 防止)", () => {
    const html = renderLicenseSuccessPage("<script>alert(1)</script>", { licenseKey: null, sku: null });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
