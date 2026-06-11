/**
 * enrich のアクセス制御テスト(PR② quota/課金)。
 *
 * - 匿名体験枠(500 回/月)の許可 / 超過 429 / 消費計上
 * - Hub license gate(hub_pro 許可 / address_managed 不可 / suspended / 未登録)
 * - per-request key 不可
 * - 429/403 の hub_pro 推奨ブロック + X-Shirabe-Recommend
 * - enrich_request signal(PII 非保持)
 * - 案 X: internal marker ヘッダの送出
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { enrich } from "../../src/routes/enrich.js";
import type { AppEnv } from "../../src/types/env.js";
import { createMockEnv } from "../helpers/mock-kv.js";
import { buildLicense, putLicense, generateLicenseKey } from "../../src/licensing/license-store.js";
import { enrichUsageKey, ENRICH_ANON_MONTHLY_LIMIT } from "../../src/enrich/access.js";

function makeApp() {
  const app = new Hono<AppEnv>();
  app.route("/api/v1/enrich", enrich);
  return app;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readBody(res: Response): Promise<any> {
  return res.json();
}

/** getAnonymousId と同じく IP の SHA-256 先頭 16 文字から匿名 ID を導く。 */
async function anonId(ip = "unknown"): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `anon_${hex.slice(0, 16)}`;
}

function stubFetch(body: unknown = { ok: true }) {
  const fn = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status: 200 })
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function post(env: AppEnv["Bindings"], body: unknown, headers: Record<string, string> = {}) {
  return makeApp().request(
    "/api/v1/enrich",
    { method: "POST", headers: { ...JSON_HEADERS, ...headers }, body: JSON.stringify(body) },
    env
  );
}

describe("enrich — 匿名体験枠", () => {
  it("枠内 → 許可 + enrich_request signal(auth_mode=anonymous、PII なし)", async () => {
    const env = createMockEnv();
    const res = await post(env, { record: { date: "2026-04-15" } }); // calendar = in-process
    expect(res.status).toBe(200);

    expect(env.ANALYTICS.points).toHaveLength(1);
    const p = env.ANALYTICS.points[0];
    expect(p.blobs?.[0]).toBe("enrich_request");
    expect(p.blobs?.[1]).toBe("calendar"); // component_mix
    expect(p.blobs?.[2]).toBe("anonymous"); // auth_mode
    expect(p.doubles).toEqual([1, 1]); // attempted / success
  });

  it("成功後に体験枠を 1 消費する", async () => {
    const env = createMockEnv();
    await post(env, { record: { date: "2026-04-15" } });
    const used = await env.USAGE_LOGS.get(enrichUsageKey(await anonId()));
    expect(used).toBe("1");
  });

  it("上限到達 → 429 + hub_pro 推奨 + ヘッダ(処理せず)", async () => {
    const env = createMockEnv();
    await env.USAGE_LOGS.put(enrichUsageKey(await anonId()), String(ENRICH_ANON_MONTHLY_LIMIT));
    const fetchFn = stubFetch();

    const res = await post(env, { record: { address: "東京都港区六本木6-10-1" } });
    expect(res.status).toBe(429);
    expect(res.headers.get("X-Shirabe-Recommend")).toBe("hub_pro");
    expect(res.headers.get("Retry-After")).toBeTruthy();

    const body = await readBody(res);
    expect(body.error.code).toBe("ENRICH_TRIAL_LIMIT_EXCEEDED");
    expect(body.error.license_recommend.sku).toBe("hub_pro");
    expect(body.error.license_recommend.checkout_url).toContain("#hub_pro");
    // 429 のときは合成を実行しない。
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("enrich — Hub license gate", () => {
  async function seedLicense(env: AppEnv["Bindings"], sku: "hub_pro" | "hub_enterprise" | "address_managed", status: "active" | "suspended" = "active") {
    const key = generateLicenseKey();
    const lic = buildLicense({ licenseKey: key, customerId: "cust_1", sku });
    await putLicense(env.API_KEYS, status === "suspended" ? { ...lic, status } : lic);
    return key;
  }

  it("hub_pro license → 許可 + 体験枠を消費しない(auth_mode=license)", async () => {
    const env = createMockEnv();
    const key = await seedLicense(env, "hub_pro");
    const res = await post(env, { record: { date: "2026-04-15" } }, { "X-API-Key": key });
    expect(res.status).toBe(200);
    expect(env.ANALYTICS.points[0].blobs?.[2]).toBe("license");
    // license 利用は匿名 quota を消費しない。
    const anonUsed = await env.USAGE_LOGS.get(enrichUsageKey(await anonId()));
    expect(anonUsed).toBeNull();
  });

  it("address_managed license → 403 LICENSE_TIER_INSUFFICIENT + hub_pro 推奨", async () => {
    const env = createMockEnv();
    const key = await seedLicense(env, "address_managed");
    const res = await post(env, { record: { date: "2026-04-15" } }, { "X-API-Key": key });
    expect(res.status).toBe(403);
    const body = await readBody(res);
    expect(body.error.code).toBe("LICENSE_TIER_INSUFFICIENT");
    expect(body.error.license_recommend.sku).toBe("hub_pro");
  });

  it("suspended license → 403 LICENSE_SUSPENDED(推奨なし)", async () => {
    const env = createMockEnv();
    const key = await seedLicense(env, "hub_pro", "suspended");
    const res = await post(env, { record: { date: "2026-04-15" } }, { "X-API-Key": key });
    expect(res.status).toBe(403);
    const body = await readBody(res);
    expect(body.error.code).toBe("LICENSE_SUSPENDED");
    expect(body.error.license_recommend).toBeUndefined();
  });

  it("未登録 license key → 401", async () => {
    const env = createMockEnv();
    const res = await post(env, { record: { date: "2026-04-15" } }, { "X-API-Key": "shrb_lic_" + "a".repeat(32) });
    expect(res.status).toBe(401);
    expect((await readBody(res)).error.code).toBe("INVALID_API_KEY");
  });

  it("per-request key → 403 LICENSE_REQUIRED + hub_pro 推奨", async () => {
    const env = createMockEnv();
    const res = await post(env, { record: { date: "2026-04-15" } }, { "X-API-Key": "shrb_" + "a".repeat(32) });
    expect(res.status).toBe(403);
    const body = await readBody(res);
    expect(body.error.code).toBe("LICENSE_REQUIRED");
    expect(body.error.license_recommend.sku).toBe("hub_pro");
  });

  it("形式不正なキー → 401", async () => {
    const env = createMockEnv();
    const res = await post(env, { record: { date: "2026-04-15" } }, { "X-API-Key": "garbage" });
    expect(res.status).toBe(401);
  });
});

describe("enrich — 案 X internal marker", () => {
  it("INTERNAL_ENRICH_TOKEN 設定時、downstream に X-Shirabe-Internal を付す", async () => {
    const env = { ...createMockEnv(), INTERNAL_ENRICH_TOKEN: "tok_secret" };
    const fetchFn = stubFetch({ input: "x", result: null, candidates: [] });
    await post(env, { record: { address: "東京都港区六本木6-10-1" } });
    expect(fetchFn).toHaveBeenCalled();
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(init).toBeDefined();
    expect((init.headers as Record<string, string>)["X-Shirabe-Internal"]).toBe("tok_secret");
  });

  it("未設定時は internal ヘッダを付さない", async () => {
    const env = createMockEnv();
    const fetchFn = stubFetch({ input: "x", result: null, candidates: [] });
    await post(env, { record: { address: "東京都港区六本木6-10-1" } });
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(init).toBeDefined();
    expect((init.headers as Record<string, string>)["X-Shirabe-Internal"]).toBeUndefined();
  });
});
