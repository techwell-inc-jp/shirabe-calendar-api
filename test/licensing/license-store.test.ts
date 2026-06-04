/**
 * Hub license KV 永続化ヘルパのテスト(#19 backend 非 Stripe 部)
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  LICENSE_KEY_PREFIX,
  licenseKvKey,
  isLicenseKey,
  generateLicenseKey,
  buildLicense,
  getLicense,
  putLicense,
} from "../../src/licensing/license-store.js";
import { SKU_ENTITLED_APIS } from "../../src/types/license.js";
import { MockKV } from "../helpers/mock-kv.js";

describe("license key format", () => {
  it("generateLicenseKey は shrb_lic_ + 32 文字英数字を返す", () => {
    const key = generateLicenseKey();
    expect(key.startsWith(LICENSE_KEY_PREFIX)).toBe(true);
    expect(key).toMatch(/^shrb_lic_[A-Za-z0-9]{32}$/);
    expect(key.length).toBe(LICENSE_KEY_PREFIX.length + 32);
  });

  it("generateLicenseKey は呼ぶたびに異なる(衝突しない)", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateLicenseKey()));
    expect(keys.size).toBe(50);
  });

  it("isLicenseKey は license key のみ true、per-request key は false", () => {
    expect(isLicenseKey(generateLicenseKey())).toBe(true);
    // per-request key(shrb_ + 32 英数字)は license key ではない
    expect(isLicenseKey("shrb_" + "a".repeat(32))).toBe(false);
    expect(isLicenseKey("shrb_lic_short")).toBe(false);
    expect(isLicenseKey("")).toBe(false);
    // underscore 混入(per-request パターンと衝突しないことの確認)
    expect(isLicenseKey("shrb_lic_" + "a_".repeat(16))).toBe(false);
  });

  it("licenseKvKey は license: prefix を付ける", () => {
    expect(licenseKvKey("shrb_lic_x")).toBe("license:shrb_lic_x");
  });
});

describe("buildLicense", () => {
  it("SKU から entitledApis を導出し active で組み立てる", () => {
    const lic = buildLicense({
      licenseKey: "shrb_lic_" + "A".repeat(32),
      customerId: "org_123",
      sku: "hub_pro",
      now: "2026-06-04T00:00:00.000Z",
    });
    expect(lic.sku).toBe("hub_pro");
    expect(lic.entitledApis).toEqual([...SKU_ENTITLED_APIS.hub_pro]);
    expect(lic.status).toBe("active");
    expect(lic.createdAt).toBe("2026-06-04T00:00:00.000Z");
    expect(lic.updatedAt).toBe("2026-06-04T00:00:00.000Z");
  });

  it("address_managed は住所のみ entitle", () => {
    const lic = buildLicense({
      licenseKey: generateLicenseKey(),
      customerId: "org_a",
      sku: "address_managed",
      now: "2026-06-04T00:00:00.000Z",
    });
    expect(lic.entitledApis).toEqual(["address"]);
  });

  it("Stripe 関連 field は未指定なら持たない(非 Stripe 部)", () => {
    const lic = buildLicense({
      licenseKey: generateLicenseKey(),
      customerId: "org_b",
      sku: "hub_pro",
      now: "2026-06-04T00:00:00.000Z",
    });
    expect("stripeCustomerId" in lic).toBe(false);
    expect("stripeSubscriptionId" in lic).toBe(false);
    expect("email" in lic).toBe(false);
  });

  it("email / Stripe ID を指定すると保持する", () => {
    const lic = buildLicense({
      licenseKey: generateLicenseKey(),
      customerId: "org_c",
      sku: "hub_enterprise",
      email: "ops@example.jp",
      stripeCustomerId: "cus_x",
      stripeSubscriptionId: "sub_y",
      now: "2026-06-04T00:00:00.000Z",
    });
    expect(lic.email).toBe("ops@example.jp");
    expect(lic.stripeCustomerId).toBe("cus_x");
    expect(lic.stripeSubscriptionId).toBe("sub_y");
  });
});

describe("getLicense / putLicense", () => {
  let kv: KVNamespace;

  beforeEach(() => {
    kv = new MockKV() as unknown as KVNamespace;
  });

  it("put → get で同じレコードが復元できる", async () => {
    const key = generateLicenseKey();
    const lic = buildLicense({
      licenseKey: key,
      customerId: "org_round",
      sku: "hub_pro",
      now: "2026-06-04T00:00:00.000Z",
    });
    await putLicense(kv, lic, "2026-06-04T00:00:00.000Z");

    const got = await getLicense(kv, key);
    expect(got).not.toBeNull();
    expect(got!.customerId).toBe("org_round");
    expect(got!.sku).toBe("hub_pro");
    expect(got!.entitledApis).toEqual([...SKU_ENTITLED_APIS.hub_pro]);
  });

  it("putLicense は license: prefix の KV key に書く", async () => {
    const key = generateLicenseKey();
    const lic = buildLicense({
      licenseKey: key,
      customerId: "org_k",
      sku: "hub_pro",
      now: "2026-06-04T00:00:00.000Z",
    });
    await putLicense(kv, lic);
    const raw = await kv.get(licenseKvKey(key));
    expect(raw).toBeTruthy();
  });

  it("putLicense は updatedAt を更新する", async () => {
    const key = generateLicenseKey();
    const lic = buildLicense({
      licenseKey: key,
      customerId: "org_u",
      sku: "hub_pro",
      now: "2026-06-04T00:00:00.000Z",
    });
    await putLicense(kv, lic, "2026-06-10T12:00:00.000Z");
    const got = await getLicense(kv, key);
    expect(got!.createdAt).toBe("2026-06-04T00:00:00.000Z");
    expect(got!.updatedAt).toBe("2026-06-10T12:00:00.000Z");
  });

  it("存在しない key は null", async () => {
    expect(await getLicense(kv, generateLicenseKey())).toBeNull();
  });

  it("license key 形式でない入力は null(KV を引かない)", async () => {
    expect(await getLicense(kv, "shrb_" + "a".repeat(32))).toBeNull();
  });

  it("JSON 不正は null(throw しない)", async () => {
    const key = generateLicenseKey();
    await kv.put(licenseKvKey(key), "{ broken json");
    expect(await getLicense(kv, key)).toBeNull();
  });
});
