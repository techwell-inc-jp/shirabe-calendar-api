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
  /** Stripe Webhook Secret（Secretsで管理） */
  STRIPE_WEBHOOK_SECRET?: string;
  /** Stripe Price ID — Starter */
  STRIPE_PRICE_STARTER?: string;
  /** Stripe Price ID — Pro */
  STRIPE_PRICE_PRO?: string;
  /** Stripe Price ID — Enterprise */
  STRIPE_PRICE_ENTERPRISE?: string;
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
