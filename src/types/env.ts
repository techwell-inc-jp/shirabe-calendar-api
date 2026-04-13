/**
 * Cloudflare Workers 環境変数・バインディングの型定義
 */
export type Env = {
  /** APIキーのハッシュ → プラン情報 */
  API_KEYS: KVNamespace;
  /** レート制限カウンター */
  RATE_LIMITS: KVNamespace;
  /** 利用量ログ */
  USAGE_LOGS: KVNamespace;
  /** APIバージョン */
  API_VERSION: string;
  /** Stripe Secret Key（Secretsで管理） */
  STRIPE_SECRET_KEY?: string;
};

/**
 * ミドルウェアがContextに設定する変数の型定義
 */
export type AppVariables = {
  plan: string;
  customerId: string;
  apiKeyHash: string;
};

/**
 * Honoアプリケーションの型パラメータ
 */
export type AppEnv = {
  Bindings: Env;
  Variables: AppVariables;
};
