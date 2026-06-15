/**
 * Hub 複合 enrich endpoint(POST /api/v1/enrich)の統合テスト(PR① core)。
 *
 * downstream(address/text/corporation)は same-zone subrequest のため global fetch を stub し、
 * calendar は in-process(暦コア)で実値を返すことを検証する。
 * 課金・quota・license gate は PR② のため本テストでは対象外。
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { enrich } from "../../src/routes/enrich.js";
import type { AppEnv } from "../../src/types/env.js";
import { createMockEnv } from "../helpers/mock-kv.js";

function makeApp() {
  const app = new Hono<AppEnv>();
  app.route("/api/v1/enrich", enrich);
  return app;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/** レスポンス本体を読む(テスト内の deep access 用に any で受ける)。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readBody(res: Response): Promise<any> {
  return res.json();
}

const ADDRESS_ATTRIBUTION = {
  source: "アドレス・ベース・レジストリ(住所データ)",
  provider: "デジタル庁",
  license: "CC BY 4.0",
  license_url: "https://creativecommons.org/licenses/by/4.0/",
};

const DICT_ATTRIBUTION = {
  dictionary: "IPAdic v3.0.7",
  license: "BSD 3-Clause",
  source: "https://github.com/lindera/lindera",
};

const ADDRESS_BODY = {
  input: "東京都港区六本木6-10-1",
  result: {
    normalized: "東京都港区六本木六丁目10番1号",
    components: { prefecture: "東京都", city: "港区", town: "六本木六丁目" },
    level: 4,
    confidence: 0.98,
  },
  candidates: [],
  attribution: ADDRESS_ATTRIBUTION,
};

const NAME_SPLIT_BODY = {
  name: "山田太郎",
  family: "山田",
  given: "太郎",
  confidence: 0.97,
  matched_by: "dictionary_both",
  attribution: DICT_ATTRIBUTION,
};

const NAME_READING_BODY = {
  name: "山田太郎",
  family: "山田",
  given: "太郎",
  family_reading: "やまだ",
  given_reading: "たろう",
  reading: "やまだたろう",
  attribution: DICT_ATTRIBUTION,
};

interface RouteStub {
  /** URL に含まれる部分文字列。 */
  match: string;
  status?: number;
  body?: unknown;
  /** ネットワーク失敗(fetch reject)を模す。 */
  fail?: boolean;
}

/** URL に応じて応答を切り替える global fetch の stub を仕込む。 */
function stubFetch(routes: RouteStub[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const route = routes.find((r) => url.includes(r.match));
      if (!route || route.fail) {
        throw new Error("network error");
      }
      return new Response(JSON.stringify(route.body ?? {}), {
        status: route.status ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function postEnrich(body: unknown) {
  return makeApp().request(
    "/api/v1/enrich",
    { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) },
    createMockEnv()
  );
}

describe("POST /api/v1/enrich — 入力検証", () => {
  it("不正 JSON → 400 INVALID_BODY", async () => {
    const res = await makeApp().request(
      "/api/v1/enrich",
      { method: "POST", headers: JSON_HEADERS, body: "{ not json" },
      createMockEnv()
    );
    expect(res.status).toBe(400);
    expect((await readBody(res)).error.code).toBe("INVALID_BODY");
  });

  it("record 欠如 → 400 INVALID_REQUEST", async () => {
    const res = await postEnrich({ fields: ["address"] });
    expect(res.status).toBe(400);
    expect((await readBody(res)).error.code).toBe("INVALID_REQUEST");
  });

  it("record が空(入力ゼロ)→ 400", async () => {
    const res = await postEnrich({ record: {} });
    expect(res.status).toBe(400);
  });

  it("record の既知フィールドが string でない → 400", async () => {
    const res = await postEnrich({ record: { address: 123 } });
    expect(res.status).toBe(400);
    expect((await readBody(res)).error.details.field).toBe("address");
  });

  it("fields に未知の component → 400", async () => {
    const res = await postEnrich({ record: { address: "x" }, fields: ["address", "bogus"] });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/enrich — calendar(in-process)", () => {
  it("date のみ → calendar 実値を返す(subrequest なし)", async () => {
    stubFetch([]);
    const res = await postEnrich({ record: { date: "2026-04-15" } });
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.results.calendar.status).toBe("ok");
    expect(body.results.calendar.calendar.rokuyo.name).toBe("大安");
    // calendar は外部 fetch を一切行わない。
    expect(fetch).not.toHaveBeenCalled();
  });

  it("不正な日付 → calendar component は error(他に影響しない)", async () => {
    stubFetch([]);
    const res = await postEnrich({ record: { date: "2026/04/15" } });
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.results.calendar.status).toBe("error");
  });
});

describe("POST /api/v1/enrich — fields 自動推定 + 合成", () => {
  it("address + name + date → 3 component 並列、attribution 集約", async () => {
    stubFetch([
      { match: "/api/v1/address/normalize", body: ADDRESS_BODY },
      { match: "/api/v1/text/name-split", body: NAME_SPLIT_BODY },
      { match: "/api/v1/text/name-reading", body: NAME_READING_BODY },
    ]);
    const res = await postEnrich({
      record: { address: "東京都港区六本木6-10-1", name: "山田太郎", date: "2026-04-15" },
    });
    expect(res.status).toBe(200);
    const body = await readBody(res);

    expect(body.results.address.status).toBe("ok");
    expect(body.results.address.normalized.result.normalized).toBe("東京都港区六本木六丁目10番1号");
    // attribution は component ペイロードから除去され top-level に集約。
    expect(body.results.address.normalized.attribution).toBeUndefined();

    expect(body.results.name.status).toBe("ok");
    expect(body.results.name.split.family).toBe("山田");
    expect(body.results.name.reading.reading).toBe("やまだたろう");

    expect(body.results.calendar.status).toBe("ok");

    // address(1) + 同一 IPAdic ×2(dedup → 1) = 2 件。
    expect(body.attribution).toHaveLength(2);
    expect(body.attribution).toContainEqual(ADDRESS_ATTRIBUTION);
    expect(body.attribution).toContainEqual(DICT_ATTRIBUTION);
  });

  it("corporate_number → corporation lookup を POST + law_id body で呼ぶ", async () => {
    // corporation API の実契約: POST /api/v1/corporation/lookup, body { law_id }, 応答 { corporation, attribution }。
    stubFetch([
      {
        match: "/api/v1/corporation/lookup",
        body: { corporation: { lawId: "1234567890123", name: "株式会社テックウェル" }, attribution: { provider: "国税庁" } },
      },
    ]);
    const res = await postEnrich({ record: { corporate_number: "1234567890123" } });
    const body = await readBody(res);
    expect(body.results.corporation.status).toBe("ok");

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain("/api/v1/corporation/lookup");
    expect(call[0]).not.toContain("?"); // querystring ではなく body で渡す
    expect(call[1].method).toBe("POST");
    expect(JSON.parse(call[1].body)).toEqual({ law_id: "1234567890123" });
  });

  it("company_name → corporation search を POST + name body で呼ぶ", async () => {
    stubFetch([
      { match: "/api/v1/corporation/search", body: { results: [{ lawId: "1234567890123", name: "株式会社テックウェル" }], count: 1, attribution: { provider: "国税庁" } } },
    ]);
    const res = await postEnrich({ record: { company_name: "株式会社テックウェル" } });
    const body = await readBody(res);
    expect(body.results.corporation.status).toBe("ok");

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain("/api/v1/corporation/search");
    expect(call[0]).not.toContain("?");
    expect(call[1].method).toBe("POST");
    expect(JSON.parse(call[1].body)).toEqual({ name: "株式会社テックウェル" });
  });
});

describe("POST /api/v1/enrich — 部分成功 / graceful degrade", () => {
  it("fields 明示で入力欠如 → skipped", async () => {
    stubFetch([{ match: "/api/v1/address/normalize", body: ADDRESS_BODY }]);
    const res = await postEnrich({
      record: { address: "東京都港区六本木6-10-1" },
      fields: ["address", "calendar"],
    });
    const body = await readBody(res);
    expect(body.results.address.status).toBe("ok");
    expect(body.results.calendar.status).toBe("skipped");
    expect(body.results.calendar.reason).toContain("no date input");
  });

  it("corp 未リリース(downstream 失敗)→ unavailable、他は ok(200 維持)", async () => {
    stubFetch([
      { match: "/api/v1/address/normalize", body: ADDRESS_BODY },
      { match: "/api/v1/corporation/lookup", fail: true },
    ]);
    const res = await postEnrich({
      record: { address: "東京都港区六本木6-10-1", corporate_number: "1234567890123" },
    });
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.results.address.status).toBe("ok");
    expect(body.results.corporation.status).toBe("unavailable");
  });

  it("downstream 503 → unavailable 扱い", async () => {
    stubFetch([{ match: "/api/v1/address/normalize", status: 503, body: { error: { code: "SERVICE_UNAVAILABLE" } } }]);
    const res = await postEnrich({ record: { address: "x" } });
    const body = await readBody(res);
    expect(body.results.address.status).toBe("unavailable");
  });

  it("全 attempted component が unavailable → 503", async () => {
    stubFetch([
      { match: "/api/v1/address/normalize", fail: true },
      { match: "/api/v1/text/name-split", fail: true },
      { match: "/api/v1/text/name-reading", fail: true },
    ]);
    const res = await postEnrich({ record: { address: "x", name: "山田太郎" } });
    expect(res.status).toBe(503);
    const body = await readBody(res);
    expect(body.results.address.status).toBe("unavailable");
    expect(body.results.name.status).toBe("unavailable");
  });

  it("calendar error + address unavailable は『全滅』ではない → 200(error は outage でない)", async () => {
    stubFetch([{ match: "/api/v1/address/normalize", fail: true }]);
    const res = await postEnrich({ record: { address: "x", date: "bad-date" } });
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.results.address.status).toBe("unavailable");
    expect(body.results.calendar.status).toBe("error");
  });

  it("name は片側のみ成功でも ok(欠けた側は null)", async () => {
    stubFetch([
      { match: "/api/v1/text/name-split", body: NAME_SPLIT_BODY },
      { match: "/api/v1/text/name-reading", fail: true },
    ]);
    const res = await postEnrich({ record: { name: "山田太郎" } });
    const body = await readBody(res);
    expect(body.results.name.status).toBe("ok");
    expect(body.results.name.split.family).toBe("山田");
    expect(body.results.name.reading).toBeNull();
  });
});
