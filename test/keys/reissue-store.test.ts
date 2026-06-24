/**
 * self-serve キー再発行ロジック(トークン管理 + キー回転)のテスト
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  EMAIL_INDEX_PREFIX,
  LICENSE_EMAIL_INDEX_PREFIX,
  STRIPE_REVERSE_PREFIX,
  REISSUE_TOKEN_PREFIX,
  generatePerRequestKey,
  generateReissueToken,
  resolveReissueTarget,
  putReissueToken,
  consumeReissueToken,
  rotatePerRequestKey,
  rotateLicenseKey,
  rotateByToken,
  type ReissueTokenRecord,
} from "../../src/keys/reissue-store.js";
import {
  buildLicense,
  generateLicenseKey,
  getLicense,
  licenseKvKey,
  putLicense,
} from "../../src/licensing/license-store.js";
import { licenseStripeReverseKvKey } from "../../src/licensing/license-checkout.js";
import { sha256Hex } from "../../src/util/sha256.js";
import { MockKV } from "../helpers/mock-kv.js";

describe("key / token generation", () => {
  it("generatePerRequestKey は shrb_ + 32 英数字(auth パターン互換)", () => {
    expect(generatePerRequestKey()).toMatch(/^shrb_[a-zA-Z0-9]{32}$/);
  });

  it("generatePerRequestKey は毎回異なる", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generatePerRequestKey()));
    expect(keys.size).toBe(50);
  });

  it("generateReissueToken は 64 hex", () => {
    expect(generateReissueToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generateReissueToken は毎回異なる", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateReissueToken()));
    expect(tokens.size).toBe(50);
  });
});

describe("resolveReissueTarget", () => {
  let usageLogs: KVNamespace;
  beforeEach(() => {
    usageLogs = new MockKV() as unknown as KVNamespace;
  });

  it("email: 索引があれば per_request を返す", async () => {
    await usageLogs.put(`${EMAIL_INDEX_PREFIX}a@example.com`, "hash_abc");
    expect(await resolveReissueTarget(usageLogs, "a@example.com")).toEqual({
      kind: "per_request",
      ref: "hash_abc",
    });
  });

  it("license-email: 索引のみなら license を返す", async () => {
    await usageLogs.put(`${LICENSE_EMAIL_INDEX_PREFIX}b@example.com`, "shrb_lic_xxx");
    expect(await resolveReissueTarget(usageLogs, "b@example.com")).toEqual({
      kind: "license",
      ref: "shrb_lic_xxx",
    });
  });

  it("per_request を license より優先する", async () => {
    await usageLogs.put(`${EMAIL_INDEX_PREFIX}c@example.com`, "hash_c");
    await usageLogs.put(`${LICENSE_EMAIL_INDEX_PREFIX}c@example.com`, "shrb_lic_c");
    expect(await resolveReissueTarget(usageLogs, "c@example.com")).toEqual({
      kind: "per_request",
      ref: "hash_c",
    });
  });

  it("索引が無ければ null", async () => {
    expect(await resolveReissueTarget(usageLogs, "none@example.com")).toBeNull();
  });
});

describe("token put / consume (single-use)", () => {
  let usageLogs: KVNamespace;
  beforeEach(() => {
    usageLogs = new MockKV() as unknown as KVNamespace;
  });

  const record: ReissueTokenRecord = {
    kind: "per_request",
    ref: "hash_x",
    email: "x@example.com",
    createdAt: "2026-06-25T00:00:00.000Z",
  };

  it("put したトークンは consume で復元できる", async () => {
    const token = generateReissueToken();
    await putReissueToken(usageLogs, token, record);
    expect(await consumeReissueToken(usageLogs, token)).toEqual(record);
  });

  it("平文トークンでなく hash を KV key にする", async () => {
    const token = generateReissueToken();
    await putReissueToken(usageLogs, token, record);
    const tokenHash = await sha256Hex(token);
    expect(await usageLogs.get(`${REISSUE_TOKEN_PREFIX}${tokenHash}`)).toBeTruthy();
    // 平文 token を key にしたエントリは存在しない
    expect(await usageLogs.get(`${REISSUE_TOKEN_PREFIX}${token}`)).toBeNull();
  });

  it("consume は single-use(2 回目は null)", async () => {
    const token = generateReissueToken();
    await putReissueToken(usageLogs, token, record);
    expect(await consumeReissueToken(usageLogs, token)).not.toBeNull();
    expect(await consumeReissueToken(usageLogs, token)).toBeNull();
  });

  it("未知トークンは null", async () => {
    expect(await consumeReissueToken(usageLogs, generateReissueToken())).toBeNull();
  });

  it("JSON 破損は null(throw しない)", async () => {
    const token = generateReissueToken();
    const tokenHash = await sha256Hex(token);
    await usageLogs.put(`${REISSUE_TOKEN_PREFIX}${tokenHash}`, "{ broken");
    expect(await consumeReissueToken(usageLogs, token)).toBeNull();
  });
});

describe("rotatePerRequestKey", () => {
  let apiKeys: KVNamespace;
  let usageLogs: KVNamespace;
  beforeEach(() => {
    apiKeys = new MockKV() as unknown as KVNamespace;
    usageLogs = new MockKV() as unknown as KVNamespace;
  });

  async function seedPaidKey(email: string) {
    const oldKey = "shrb_" + "A".repeat(32);
    const oldHash = await sha256Hex(oldKey);
    const record = {
      plan: "pro",
      customerId: "cust_old",
      stripeCustomerId: "cus_stripe_1",
      stripeSubscriptionId: "sub_1",
      email,
      status: "active",
      createdAt: "2026-06-01T00:00:00.000Z",
    };
    await apiKeys.put(oldHash, JSON.stringify(record));
    await usageLogs.put(`${EMAIL_INDEX_PREFIX}${email}`, oldHash);
    await usageLogs.put(`${STRIPE_REVERSE_PREFIX}cus_stripe_1`, `cust_old,${oldHash}`);
    return { oldKey, oldHash, record };
  }

  it("新キーを発行し、旧ハッシュを失効、索引を更新する", async () => {
    const email = "paid@example.com";
    const { oldHash, record } = await seedPaidKey(email);

    const newKey = await rotatePerRequestKey(apiKeys, usageLogs, oldHash, email);
    expect(newKey).toMatch(/^shrb_[a-zA-Z0-9]{32}$/);

    const newHash = await sha256Hex(newKey!);
    // 旧ハッシュは削除
    expect(await apiKeys.get(oldHash)).toBeNull();
    // 新ハッシュに同一レコード(customerId 据え置き)
    const moved = JSON.parse((await apiKeys.get(newHash))!);
    expect(moved.customerId).toBe("cust_old");
    expect(moved.plan).toBe("pro");
    expect(moved.stripeCustomerId).toBe("cus_stripe_1");
    // email 索引が新ハッシュを指す
    expect(await usageLogs.get(`${EMAIL_INDEX_PREFIX}${email}`)).toBe(newHash);
    // stripe-reverse が新ハッシュを指す
    expect(await usageLogs.get(`${STRIPE_REVERSE_PREFIX}cus_stripe_1`)).toBe(
      `cust_old,${newHash}`
    );
    void record;
  });

  it("対象ハッシュが無ければ null", async () => {
    expect(
      await rotatePerRequestKey(apiKeys, usageLogs, "missing_hash", "x@example.com")
    ).toBeNull();
  });

  it("stripeCustomerId 無しでも回転する(stripe-reverse は書かない)", async () => {
    const email = "nostripe@example.com";
    const oldKey = "shrb_" + "B".repeat(32);
    const oldHash = await sha256Hex(oldKey);
    await apiKeys.put(
      oldHash,
      JSON.stringify({ plan: "starter", customerId: "cust_ns", status: "active", createdAt: "x" })
    );
    await usageLogs.put(`${EMAIL_INDEX_PREFIX}${email}`, oldHash);

    const newKey = await rotatePerRequestKey(apiKeys, usageLogs, oldHash, email);
    expect(newKey).not.toBeNull();
    const newHash = await sha256Hex(newKey!);
    expect(await usageLogs.get(`${EMAIL_INDEX_PREFIX}${email}`)).toBe(newHash);
  });

  it("aggregated フォーマット(apis.*)も customerId 据え置きで移植する", async () => {
    const email = "agg@example.com";
    const oldKey = "shrb_" + "C".repeat(32);
    const oldHash = await sha256Hex(oldKey);
    const aggregated = {
      customerId: "cust_agg",
      stripeCustomerId: "cus_agg",
      email,
      createdAt: "2026-06-01T00:00:00.000Z",
      apis: { calendar: { plan: "pro", status: "active" }, address: { plan: "starter" } },
    };
    await apiKeys.put(oldHash, JSON.stringify(aggregated));
    await usageLogs.put(`${EMAIL_INDEX_PREFIX}${email}`, oldHash);

    const newKey = await rotatePerRequestKey(apiKeys, usageLogs, oldHash, email);
    const newHash = await sha256Hex(newKey!);
    const moved = JSON.parse((await apiKeys.get(newHash))!);
    expect(moved.apis.calendar.plan).toBe("pro");
    expect(moved.apis.address.plan).toBe("starter");
    expect(moved.customerId).toBe("cust_agg");
  });
});

describe("rotateLicenseKey", () => {
  let apiKeys: KVNamespace;
  let usageLogs: KVNamespace;
  beforeEach(() => {
    apiKeys = new MockKV() as unknown as KVNamespace;
    usageLogs = new MockKV() as unknown as KVNamespace;
  });

  it("新 license key を発行し、旧キーを失効、索引を更新する", async () => {
    const email = "org@example.com";
    const oldKey = generateLicenseKey();
    const lic = buildLicense({
      licenseKey: oldKey,
      customerId: "org_1",
      sku: "hub_pro",
      email,
      stripeCustomerId: "cus_lic",
      now: "2026-06-01T00:00:00.000Z",
    });
    await putLicense(apiKeys, lic);
    await usageLogs.put(`${LICENSE_EMAIL_INDEX_PREFIX}${email}`, oldKey);
    await usageLogs.put(licenseStripeReverseKvKey("cus_lic"), oldKey);

    const newKey = await rotateLicenseKey(apiKeys, usageLogs, oldKey, email);
    expect(newKey).toMatch(/^shrb_lic_[A-Za-z0-9]{32}$/);

    // 旧キー失効
    expect(await apiKeys.get(licenseKvKey(oldKey))).toBeNull();
    expect(await getLicense(apiKeys, oldKey)).toBeNull();
    // 新キーに同一 entitlement(customerId 据え置き)
    const moved = await getLicense(apiKeys, newKey!);
    expect(moved!.customerId).toBe("org_1");
    expect(moved!.sku).toBe("hub_pro");
    expect(moved!.entitledApis).toContain("calendar");
    // 索引が新キーを指す
    expect(await usageLogs.get(`${LICENSE_EMAIL_INDEX_PREFIX}${email}`)).toBe(newKey);
    expect(await usageLogs.get(licenseStripeReverseKvKey("cus_lic"))).toBe(newKey);
  });

  it("対象 license が無ければ null", async () => {
    expect(
      await rotateLicenseKey(apiKeys, usageLogs, generateLicenseKey(), "x@example.com")
    ).toBeNull();
  });
});

describe("rotateByToken dispatch", () => {
  let apiKeys: KVNamespace;
  let usageLogs: KVNamespace;
  beforeEach(() => {
    apiKeys = new MockKV() as unknown as KVNamespace;
    usageLogs = new MockKV() as unknown as KVNamespace;
  });

  it("kind=license なら license を回転する", async () => {
    const email = "d@example.com";
    const oldKey = generateLicenseKey();
    await putLicense(
      apiKeys,
      buildLicense({ licenseKey: oldKey, customerId: "org_d", sku: "hub_pro", email, now: "x" })
    );
    const newKey = await rotateByToken(apiKeys, usageLogs, {
      kind: "license",
      ref: oldKey,
      email,
      createdAt: "x",
    });
    expect(newKey).toMatch(/^shrb_lic_/);
  });
});
