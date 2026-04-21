/**
 * APIキー認証ミドルウェア
 *
 * - X-API-Key ヘッダーからキーを取得
 * - SHA-256ハッシュ化してCloudflare KVと照合
 * - キー形式: shrb_ + 32文字ランダム
 * - ヘッダー未指定の場合は匿名Freeユーザーとして通す（Phase 1）
 * - キーは指定されているが形式不正/未登録なら 401 Unauthorized を返す
 * - 認証成功時、プラン情報をc.set()でコンテキストに格納
 *
 * 2026-04-22 更新: KV 1 キー集約構造(`src/types/api-key.ts`)対応。
 * 旧フォーマット(フラット `plan`)は `resolveApiPlan` が in-memory で
 * 新フォーマットに変換して透過的に読み取る。既存の KV データと 244 テストは
 * 無変更で動作する(後方互換性保証)。
 */
import type { Context, Next } from "hono";
import type { AppEnv } from "../types/env.js";
import {
  resolveApiPlan,
  type StoredApiKeyInfo,
} from "../types/api-key.js";

/** APIキーの形式: shrb_ + 32文字の英数字 */
const API_KEY_PATTERN = /^shrb_[a-zA-Z0-9]{32}$/;

/**
 * APIキーをSHA-256でハッシュ化する
 */
async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 任意文字列をSHA-256でハッシュ化し、16進文字列として返す
 */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 匿名ユーザーのcustomerIdを生成する
 *
 * `CF-Connecting-IP` ヘッダーからIPアドレスを取得し、SHA-256ハッシュ化した
 * 先頭16文字を `anon_` プレフィックスに付けて返す。
 * ヘッダーが無い場合は "unknown" をIPの代わりに用いる。
 */
export async function getAnonymousId(c: Context<AppEnv>): Promise<string> {
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  const hash = await sha256Hex(ip);
  return `anon_${hash.slice(0, 16)}`;
}

/**
 * KVに保存されるAPIキー情報(旧フォーマット・フラット形式)
 *
 * webhook.ts が書き込みで使用している暦 API 単独時代のフォーマット。
 * Phase 1 では書き込みパスを変更しない(既存 244 テスト保全)ため、
 * webhook.ts から使い続けられる。本型は `src/types/api-key.ts` の
 * `LegacyApiKeyInfo` と構造一致。
 *
 * Phase 2 で webhook を新フォーマット書込に移行した後、本型は削除予定。
 */
export type ApiKeyInfo = {
  plan: "free" | "starter" | "pro" | "enterprise";
  customerId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  email?: string;
  /** 未設定は "active" 扱い（後方互換） */
  status?: "active" | "suspended";
  createdAt: string;
};

/**
 * APIキー認証ミドルウェア
 */
export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const apiKey = c.req.header("X-API-Key");

  // Phase 1: APIキーヘッダー未指定は匿名Freeユーザーとして通す
  if (!apiKey) {
    c.set("plan", "free");
    c.set("customerId", await getAnonymousId(c));
    c.set("apiKeyHash", "");
    // S1計測: 匿名は apiKeyIdHash なし(ミドルウェア側で "none" 扱い)
    c.set("apiKeyIdHash", "");
    await next();
    return;
  }

  // 形式チェック
  if (!API_KEY_PATTERN.test(apiKey)) {
    return c.json(
      {
        error: {
          code: "INVALID_API_KEY",
          message: "Invalid or missing API key. Include X-API-Key header.",
        },
      },
      401
    );
  }

  // SHA-256ハッシュ化してKV検索
  const hash = await hashApiKey(apiKey);
  const keyInfoStr = await c.env.API_KEYS.get(hash);

  if (!keyInfoStr) {
    return c.json(
      {
        error: {
          code: "INVALID_API_KEY",
          message: "Invalid or missing API key. Include X-API-Key header.",
        },
      },
      401
    );
  }

  // KV 値を StoredApiKeyInfo として受け取り、旧フォーマットも透過的に処理する
  const stored: StoredApiKeyInfo = JSON.parse(keyInfoStr);
  const planInfo = resolveApiPlan(stored, "calendar");

  // 暦 API のプランが未設定(apis.calendar が無い新フォーマットレコード)なら
  // 匿名 Free 扱い(住所 API 単独契約の顧客が暦 API にアクセスしたケース等)。
  if (!planInfo) {
    c.set("plan", "free");
    c.set("customerId", stored.customerId);
    c.set("apiKeyHash", hash);
    c.set("apiKeyIdHash", hash.slice(0, 16));
    await next();
    return;
  }

  // Phase 5: suspended 状態のAPIキーは403を返す
  // status が未設定/undefined の場合は "active" 扱い（後方互換）
  if (planInfo.status === "suspended") {
    return c.json(
      {
        error: {
          code: "API_KEY_SUSPENDED",
          message:
            "API key suspended due to payment failure. Update payment at: https://shirabe.dev/billing",
        },
      },
      403
    );
  }

  // プラン情報をコンテキストに格納
  c.set("plan", planInfo.plan);
  c.set("customerId", stored.customerId);
  c.set("apiKeyHash", hash);
  // S1計測: 生キーは記録せず、SHA-256先頭16文字のみを識別子として使用
  c.set("apiKeyIdHash", hash.slice(0, 16));

  await next();
}

// hashApiKeyをテスト用にエクスポート
export { hashApiKey };
