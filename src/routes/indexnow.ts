/**
 * IndexNow protocol 実装(B-1 加速、5/1 住所 API リリース wave に同行)
 *
 * 目的: Bing / Microsoft Copilot / ChatGPT search backbone への push 型 indexing 要求を
 * 通じて、shirabe.dev 全 URL の AI 検索 reach を構造強化する。Google Indexing API は
 * JobPosting / BroadcastEvent 限定で利用不可と判明したため(2026-04-28 verify)、
 * IndexNow が唯一の即効性ある push 型 reach 経路。
 *
 * 仕様参照: <https://www.indexnow.org/documentation>
 *   - Endpoint: api.indexnow.org/indexnow(参加全 search engine 自動共有)
 *   - Single submit: GET ?url=...&key=...
 *   - Batch submit: POST {host, key, urlList} JSON、最大 10,000 URL/post
 *   - Key 形式: 8〜128 hex 文字(英数字 + ダッシュ)
 *   - Key 検証ファイル: https://shirabe.dev/{key}.txt(UTF-8、内容 = key 値)
 *   - 200=OK / 202=key 検証中 / 400=不正 / 403=key 無効 / 422=host 不一致 / 429=過剰送信
 *
 * 設計詳細: shirabe-assets/knowledge/bing-indexnow-implementation.md
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/env.js";
import { verifyBasicAuth } from "./internal-stats.js";
import {
  enumerateDateRange,
  DOCS_SITEMAP_PAGES,
} from "./sitemap-helpers.js";
import { enumerateAllPurposeUrls } from "../data/purposes-map.js";

/**
 * IndexNow 一括送信エンドポイント。POST 1 batch 上限。
 * 参加 search engine に自動共有される中立 endpoint。
 */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** IndexNow 仕様で許される 1 リクエストあたりの最大 URL 数 */
export const INDEXNOW_BATCH_LIMIT = 10_000;

/** shirabe.dev のホスト名(IndexNow の host フィールドおよび 422 検証で使用) */
export const SHIRABE_HOST = "shirabe.dev";

/**
 * IndexNow protocol が許す key 形式 ＝ 8〜128 文字の hex 英数字 + ダッシュ。
 * 検証ファイルパスのルーティング regex でも同等条件を使う。
 */
export const INDEXNOW_KEY_REGEX = /^[A-Fa-f0-9-]{8,128}$/;

/** Sitemap target identifier(admin endpoint の body で指定) */
export type SitemapTarget = "docs" | "days-1" | "days-2" | "days-3" | "days-4" | "purposes" | "all";

const ALL_TARGETS: SitemapTarget[] = [
  "docs",
  "days-1",
  "days-2",
  "days-3",
  "days-4",
  "purposes",
];

/**
 * 指定 sub-sitemap target に対応する shirabe.dev URL の配列を生成する。
 *
 * - docs: `/sitemap-docs.xml` の対象 URL(top + 静的ページ + openapi 等)
 * - days-1〜4: `/days/{YYYY-MM-DD}/` の対象 URL
 * - purposes: `/purposes/{slug}/{YYYY-MM}/` の対象 URL
 * - all: 上記全て(計約 91K URL)
 *
 * generateXxxSitemapBody との重複を避けるため、URL リストのみを純粋に返す。
 */
export function getUrlsForSitemap(target: SitemapTarget): string[] {
  switch (target) {
    case "docs":
      return DOCS_SITEMAP_PAGES.map((p) => p.loc);
    case "days-1":
      return enumerateDateRange(1873, 1949).map((d) => `https://shirabe.dev/days/${d}/`);
    case "days-2":
      return enumerateDateRange(1950, 1999).map((d) => `https://shirabe.dev/days/${d}/`);
    case "days-3":
      return enumerateDateRange(2000, 2049).map((d) => `https://shirabe.dev/days/${d}/`);
    case "days-4":
      return enumerateDateRange(2050, 2100).map((d) => `https://shirabe.dev/days/${d}/`);
    case "purposes":
      return enumerateAllPurposeUrls().map(
        (u) => `https://shirabe.dev/purposes/${u.slug}/${u.year}-${String(u.month).padStart(2, "0")}/`
      );
    case "all": {
      const out: string[] = [];
      for (const t of ALL_TARGETS) {
        out.push(...getUrlsForSitemap(t));
      }
      return out;
    }
  }
}

/**
 * URL 配列を IndexNow batch 上限(10,000 件)で分割する pure 関数。
 *
 * @param urls 対象 URL 配列
 * @param batchSize 1 batch あたりの最大件数(デフォルト 10,000)
 */
export function splitBatches<T>(urls: ReadonlyArray<T>, batchSize: number = INDEXNOW_BATCH_LIMIT): T[][] {
  if (batchSize < 1) throw new Error("batchSize must be >= 1");
  const batches: T[][] = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    batches.push(urls.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * IndexNow API への 1 batch POST を実行する。
 *
 * 失敗(非 2xx, ネットワーク)時は `{ok: false, status, message}` を返す。
 * 成功時は `{ok: true, status}` を返す(IndexNow は 200 = OK / 202 = key 検証中)。
 */
export type IndexNowSubmitResult =
  | { ok: true; status: number; submittedCount: number }
  | { ok: false; status: number; submittedCount: number; message: string };

export async function submitBatchToIndexNow(
  urls: string[],
  key: string,
  fetchImpl: typeof fetch = fetch
): Promise<IndexNowSubmitResult> {
  const body = JSON.stringify({
    host: SHIRABE_HOST,
    key,
    keyLocation: `https://${SHIRABE_HOST}/${key}.txt`,
    urlList: urls,
  });

  let res: Response;
  try {
    res = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, submittedCount: urls.length, message: `network error: ${message}` };
  }

  if (res.status >= 200 && res.status < 300) {
    return { ok: true, status: res.status, submittedCount: urls.length };
  }

  let text = "";
  try {
    text = await res.text();
  } catch {
    /* ignore */
  }
  return {
    ok: false,
    status: res.status,
    submittedCount: urls.length,
    message: text.slice(0, 500),
  };
}

// ---------------------------------------------------------------------------
// Hono routers
// ---------------------------------------------------------------------------

/**
 * IndexNow key 検証ファイル配信用ハンドラ。
 *
 * 仕様: `GET /{INDEXNOW_KEY}.txt` で key 値そのものを text 返却する。
 * - INDEXNOW_KEY 未設定 → 404
 * - リクエストの :keyfile が `{INDEXNOW_KEY}.txt` と完全一致しなければ → 404
 *   (key 形式に合致する任意ファイル名でリクエストされた場合の防御。
 *    探索的アクセスに本物の key 値を漏らさない。本来 key 自体は public だが、
 *    路探りログを Cloudflare 側で観測しやすくする)
 *
 * `:keyfile` の正規表現で route 段階で hex8〜128 + ダッシュ + `.txt` 限定にマッチさせる
 * ことで、`/llms.txt`(英文字)・`/robots.txt`・`/openapi.yaml` 等とは衝突しない。
 */
export function serveIndexNowKey(keyParam: string, configuredKey: string | undefined): {
  status: number;
  body: string;
  contentType?: string;
} {
  if (!configuredKey) {
    return { status: 404, body: "Not Found" };
  }
  if (keyParam !== `${configuredKey}.txt`) {
    return { status: 404, body: "Not Found" };
  }
  return {
    status: 200,
    body: configuredKey,
    contentType: "text/plain; charset=utf-8",
  };
}

/**
 * IndexNow 管理 endpoint(Basic 認証保護):
 *
 *   POST /internal/indexnow/submit
 *
 * Body(JSON):
 *   { "sitemap": "docs" | "days-1" | "days-2" | "days-3" | "days-4" | "purposes" | "all" }
 *
 * 動作:
 * - INDEXNOW_KEY 未設定 → 500
 * - Basic 認証(INTERNAL_STATS_USER / INTERNAL_STATS_PASS)失敗 → 401
 * - body 不正 → 400
 * - 各 batch を api.indexnow.org に POST、結果を集計して返却
 *
 * 戻り値(JSON):
 *   {
 *     target: "...",
 *     totalUrls: N,
 *     batchCount: M,
 *     successBatches: K,
 *     failedBatches: L,
 *     submittedUrls: TotalSubmitted,
 *     errors: [{ batchIndex, status, message }]
 *   }
 *
 * 4 日分割 bulk submit 戦略(spam 判定回避):
 *   Day 1: docs + purposes
 *   Day 2: days-1
 *   Day 3: days-2 + days-3
 *   Day 4: days-4
 *   詳細: shirabe-assets/knowledge/bing-indexnow-implementation.md §3.2
 */
const indexnowAdmin = new Hono<AppEnv>();

indexnowAdmin.post("/submit", async (c) => {
  // --- 1. Basic 認証 ---
  const authResult = verifyBasicAuth(c.req.header("Authorization"), c.env);
  if (!authResult.ok) {
    return c.json(
      {
        error: { code: "UNAUTHORIZED", message: authResult.message },
      },
      401,
      { "WWW-Authenticate": 'Basic realm="internal"' }
    );
  }

  // --- 2. INDEXNOW_KEY 設定チェック ---
  const key = c.env.INDEXNOW_KEY;
  if (!key || !INDEXNOW_KEY_REGEX.test(key)) {
    return c.json(
      {
        error: {
          code: "CONFIG_MISSING",
          message: "INDEXNOW_KEY must be configured (8-128 hex/dash chars). Set via `wrangler secret put INDEXNOW_KEY`.",
        },
      },
      500
    );
  }

  // --- 3. body 解析 ---
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: { code: "INVALID_BODY", message: "Body must be valid JSON" },
      },
      400
    );
  }

  const target = (body as { sitemap?: unknown }).sitemap;
  if (typeof target !== "string" || !isValidSitemapTarget(target)) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAMS",
          message: `'sitemap' must be one of: docs, days-1, days-2, days-3, days-4, purposes, all`,
        },
      },
      400
    );
  }

  // --- 4. URL リスト生成と batch 分割 ---
  const urls = getUrlsForSitemap(target);
  const batches = splitBatches(urls, INDEXNOW_BATCH_LIMIT);

  // --- 5. 各 batch を api.indexnow.org に POST ---
  type ErrorEntry = { batchIndex: number; status: number; message: string };
  const errors: ErrorEntry[] = [];
  let successBatches = 0;
  let submittedUrls = 0;

  for (let i = 0; i < batches.length; i++) {
    const result = await submitBatchToIndexNow(batches[i]!, key);
    if (result.ok) {
      successBatches++;
      submittedUrls += result.submittedCount;
    } else {
      errors.push({
        batchIndex: i,
        status: result.status,
        message: result.message,
      });
    }
  }

  return c.json({
    target,
    totalUrls: urls.length,
    batchCount: batches.length,
    successBatches,
    failedBatches: errors.length,
    submittedUrls,
    errors,
  });
});

function isValidSitemapTarget(s: string): s is SitemapTarget {
  return (
    s === "docs" ||
    s === "days-1" ||
    s === "days-2" ||
    s === "days-3" ||
    s === "days-4" ||
    s === "purposes" ||
    s === "all"
  );
}

export { indexnowAdmin };
