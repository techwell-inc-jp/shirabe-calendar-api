/**
 * S1 計測基盤: ハッシュユーティリティ
 *
 * APIキー識別用の先頭16文字(hex)ハッシュを生成する。
 * Web Crypto API(SubtleCrypto)で SHA-256 を計算し、16進文字列の先頭16文字を返す。
 *
 * PII配慮:
 * - 生APIキーはAEに書かない
 * - 先頭16文字(64ビット相当)まで切り詰めることで逆算困難性を維持しつつ、
 *   識別キーとしての区別性を確保する
 */

/**
 * 入力文字列のSHA-256ハッシュを計算し、16進文字列の先頭16文字を返す。
 */
export async function sha256Hex16(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 16);
}

/**
 * 既存のSHA-256 hex(64文字)から先頭16文字を切り出すヘルパー。
 * auth ミドルウェアで既にSHA-256を計算済みの場合はこちらを使うと二重計算を避けられる。
 */
export function truncateToIdHash(hexFull: string): string {
  return hexFull.slice(0, 16);
}
