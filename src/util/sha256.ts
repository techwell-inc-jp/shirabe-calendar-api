/**
 * SHA-256 ハッシュを 16 進文字列で返す共通ユーティリティ
 *
 * checkout.ts(API キーハッシュ化)と webhook.ts(G-A cross-API 相関の email ハッシュ化)で共用する。
 * Web Crypto API ベースで Cloudflare Workers 互換。
 */
export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
