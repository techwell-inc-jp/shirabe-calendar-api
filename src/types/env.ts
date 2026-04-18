/**
 * Cloudflare Workers 環境変数・バインディングの型定義
 */

/**
 * Analytics Engine データセット(最小インターフェース)
 *
 * `@cloudflare/workers-types` の `AnalyticsEngineDataset` と互換の形を持ちつつ、
 * テスト用モックでも差し替えられるよう最小限の形状で定義する。
 */
export type AnalyticsEngineDataPoint = {
  blobs?: string[];
  doubles?: number[];
  indexes?: string[];
};

export type AnalyticsEngineDataset = {
  writeDataPoint: (point: AnalyticsEngineDataPoint) => void;
};

export type Env = {
  /** APIキーのハッシュ → プラン情報 */
  API_KEYS: KVNamespace;
  /** レート制限カウンター */
  RATE_LIMITS: KVNamespace;
  /** 利用量ログ */
  USAGE_LOGS: KVNamespace;
  /** S1: Analytics Engine データセット(AI/人間分離計測) */
  ANALYTICS?: AnalyticsEngineDataset;
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
  /** S1: /internal/stats Basic認証ユーザー名(Secret) */
  INTERNAL_STATS_USER?: string;
  /** S1: /internal/stats Basic認証パスワード(Secret) */
  INTERNAL_STATS_PASS?: string;
  /** S1: Cloudflare Account ID(Analytics Engine SQL API 用) */
  CF_ACCOUNT_ID?: string;
  /** S1: Account Analytics:Read のみ付与した最小権限APIトークン */
  CF_AE_READ_TOKEN?: string;
};

/**
 * ミドルウェアがContextに設定する変数の型定義
 */
export type AppVariables = {
  plan: string;
  customerId: string;
  /** APIキーのSHA-256ハッシュ全文(64 hex) - 互換用 */
  apiKeyHash: string;
  /** APIキー識別用のSHA-256ハッシュ先頭16文字(hex) - S1計測用。匿名時は空 */
  apiKeyIdHash: string;
};

/**
 * Honoアプリケーションの型パラメータ
 */
export type AppEnv = {
  Bindings: Env;
  Variables: AppVariables;
};
