/**
 * APIキー認証ミドルウェア
 *
 * - X-API-Key ヘッダーからキーを取得
 * - SHA-256ハッシュ化してCloudflare KVと照合
 * - キー形式: shrb_ + 32文字ランダム
 * - 無効/未指定なら 401 Unauthorized を返す
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

/** KVに保存されるAPIキー情報 */
export type ApiKeyInfo = {
  plan: "free" | "starter" | "pro" | "enterprise";
  customerId: string;
  stripeSubscriptionId?: string;
  createdAt: string;
};

/**
 * APIキー認証ミドルウェア
 */
export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const apiKey = c.req.header("X-API-Key");

  if (!apiKey) {
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

  // プラン情報をコンテキストに格納
  c.set("plan", keyInfo.plan);
  c.set("customerId", keyInfo.customerId);
  c.set("apiKeyHash", hash);

  await next();
}

// hashApiKeyをテスト用にエクスポート
export { hashApiKey };
