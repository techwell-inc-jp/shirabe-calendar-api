/**
 * APIキー認証ミドルウェア
 *
 * - X-API-Key ヘッダーからキーを取得
 * - SHA-256ハッシュ化してCloudflare KVと照合
 * - キー形式: shrb_ + 32文字ランダム
 * - ヘッダー未指定の場合は匿名Freeユーザーとして通す（Phase 1）
 * - キーは指定されているが形式不正/未登録なら 401 Unauthorized を返す
 * - 認証成功時、プラン情報をc.set()でコンテキストに格納
 */
import type { Context, Next } from "hono";
import type { AppEnv } from "../types/env.js";

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

/** KVに保存されるAPIキー情報 */
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

  const keyInfo: ApiKeyInfo = JSON.parse(keyInfoStr);

  // Phase 5: suspended 状態のAPIキーは403を返す
  // status が未設定/undefined の場合は "active" 扱い（後方互換）
  if (keyInfo.status === "suspended") {
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
  c.set("plan", keyInfo.plan);
  c.set("customerId", keyInfo.customerId);
  c.set("apiKeyHash", hash);
  // S1計測: 生キーは記録せず、SHA-256先頭16文字のみを識別子として使用
  c.set("apiKeyIdHash", hash.slice(0, 16));

  await next();
}

// hashApiKeyをテスト用にエクスポート
export { hashApiKey };
