/**
 * APIエンドポイントの統合テスト
 */
import { describe, it, expect, beforeAll } from "vitest";
import app from "../../src/index.js";
import { MockKV } from "../helpers/mock-kv.js";
import { hashApiKey } from "../../src/middleware/auth.js";

const TEST_API_KEY = "shrb_abcdefghijklmnopqrstuvwxyz012345";

/** テスト用の環境変数（KVバインディング含む） */
let env: Record<string, unknown>;

beforeAll(async () => {
  const apiKeysKV = new MockKV();
  const hash = await hashApiKey(TEST_API_KEY);
  await apiKeysKV.put(
    hash,
    JSON.stringify({ plan: "pro", customerId: "cust_test", createdAt: "2026-01-01T00:00:00Z" })
  );

  env = {
    API_VERSION: "1.0.0",
    API_KEYS: apiKeysKV,
    RATE_LIMITS: new MockKV(),
    USAGE_LOGS: new MockKV(),
  };
});

/**
 * ヘルパー: テスト用リクエストを送信（認証ヘッダー付き）
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
async function request(path: string) {
  const req = new Request(`http://localhost${path}`, {
    headers: { "X-API-Key": TEST_API_KEY },
  });
  return app.fetch(req, env);
}

/** ヘルパー: 認証なしリクエスト */
async function requestNoAuth(path: string) {
  const req = new Request(`http://localhost${path}`);
  return app.fetch(req, env);
}

async function json(res: Response): Promise<any> {
  return res.json();
}

describe("GET /health", () => {
  it("正常にヘルスチェックを返す", async () => {
    const res = await requestNoAuth("/health");
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.status).toBe("ok");
    expect(body.version).toBe("1.0.0");
    expect(body.timestamp).toBeTruthy();
  });
});

describe("GET /api/v1/calendar/:date", () => {
  it("正しい日付で200を返す", async () => {
    const res = await request("/api/v1/calendar/2026-04-12");
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.date).toBe("2026-04-12");
    expect(body.wareki).toContain("令和");
    expect(body.day_of_week).toBeDefined();
    expect(body.kyureki).toBeDefined();
    expect(body.rokuyo).toBeDefined();
    expect(body.kanshi).toBeDefined();
    expect(body.nijushi_sekki).toBeDefined();
    expect(body.rekichu).toBeDefined();
    expect(body.context).toBeDefined();
    expect(body.summary).toBeDefined();
  });

  it("カテゴリ指定が動作する", async () => {
    const res = await request("/api/v1/calendar/2026-04-12?categories=wedding,business");
    expect(res.status).toBe(200);

    const body = await json(res);
    const keys = Object.keys(body.context);
    expect(keys.length).toBe(2);
    expect(keys).toContain("結婚");
    expect(keys).toContain("開業");
  });

  it("不正な日付で400を返す", async () => {
    const res = await request("/api/v1/calendar/invalid");
    expect(res.status).toBe(400);

    const body = await json(res);
    expect(body.error.code).toBe("INVALID_DATE");
  });

  it("範囲外の日付で400を返す", async () => {
    const res = await request("/api/v1/calendar/1800-01-01");
    expect(res.status).toBe(400);
  });

  it("存在しない日付で400を返す", async () => {
    const res = await request("/api/v1/calendar/2026-02-29");
    expect(res.status).toBe(400);
  });

  it("不正なカテゴリで400を返す", async () => {
    const res = await request("/api/v1/calendar/2026-04-12?categories=invalid");
    expect(res.status).toBe(400);

    const body = await json(res);
    expect(body.error.code).toBe("INVALID_PARAMETER");
  });
});

describe("GET /api/v1/calendar/range", () => {
  it("正しいパラメータで200を返す", async () => {
    const res = await request("/api/v1/calendar/range?start=2026-04-01&end=2026-04-10");
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.start).toBe("2026-04-01");
    expect(body.end).toBe("2026-04-10");
    expect(body.count).toBe(10);
    expect(body.dates.length).toBe(10);
    expect(body.filters_applied).toBeDefined();
  });

  it("六曜フィルターが動作する", async () => {
    const res = await request("/api/v1/calendar/range?start=2026-04-01&end=2026-04-30&filter_rokuyo=大安");
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.count).toBeLessThan(30);
    for (const d of body.dates) {
      expect(d.rokuyo).toBe("大安");
    }
  });

  it("必須パラメータなしで400を返す", async () => {
    const res = await request("/api/v1/calendar/range?start=2026-04-01");
    expect(res.status).toBe(400);
  });

  it("93日超で400を返す", async () => {
    const res = await request("/api/v1/calendar/range?start=2026-01-01&end=2026-12-31");
    expect(res.status).toBe(400);

    const body = await json(res);
    expect(body.error.message).toContain("93");
  });

  it("end < startで400を返す", async () => {
    const res = await request("/api/v1/calendar/range?start=2026-04-30&end=2026-04-01");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/calendar/best-days", () => {
  it("正しいパラメータで200を返す", async () => {
    const res = await request("/api/v1/calendar/best-days?purpose=wedding&start=2026-04-01&end=2026-04-30");
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.purpose).toBe("wedding");
    expect(body.period.start).toBe("2026-04-01");
    expect(body.period.end).toBe("2026-04-30");
    expect(body.best_days.length).toBeLessThanOrEqual(5);
    expect(body.best_days.length).toBeGreaterThan(0);

    // ランク順
    for (let i = 0; i < body.best_days.length; i++) {
      expect(body.best_days[i].rank).toBe(i + 1);
    }
  });

  it("limit指定が動作する", async () => {
    const res = await request("/api/v1/calendar/best-days?purpose=business&start=2026-04-01&end=2026-04-30&limit=3");
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.best_days.length).toBeLessThanOrEqual(3);
  });

  it("必須パラメータなしで400を返す", async () => {
    const res = await request("/api/v1/calendar/best-days?purpose=wedding");
    expect(res.status).toBe(400);
  });

  it("不正なpurposeで400を返す", async () => {
    const res = await request("/api/v1/calendar/best-days?purpose=invalid&start=2026-04-01&end=2026-04-30");
    expect(res.status).toBe(400);
  });

  it("365日超で400を返す", async () => {
    const res = await request("/api/v1/calendar/best-days?purpose=wedding&start=2026-01-01&end=2027-06-01");
    expect(res.status).toBe(400);
  });

  it("除外曜日が動作する", async () => {
    const res = await request(
      "/api/v1/calendar/best-days?purpose=wedding&start=2026-04-01&end=2026-04-30&exclude_weekdays=月,火,水,木,金"
    );
    expect(res.status).toBe(200);

    const body = await json(res);
    for (const day of body.best_days) {
      expect(["土曜日", "日曜日"]).toContain(day.day_of_week);
    }
  });
});

describe("404", () => {
  it("存在しないパスで404を返す", async () => {
    const res = await requestNoAuth("/nonexistent");
    expect(res.status).toBe(404);

    const body = await json(res);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
