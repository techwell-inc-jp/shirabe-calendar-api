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
  /**
   * Hub license の flat recurring Price ID(#19 Lever 1、2026-06-09 発行・登録)。
   * per-request(metered)の STRIPE_PRICE_* とは別レイヤ。各 SKU = 1 つの flat 月額 Price。
   *   - address_managed: ¥40,000/月  → STRIPE_PRICE_ADDRESS_MANAGED
   *   - hub_pro:         ¥120,000/月 → STRIPE_PRICE_HUB_PRO
   *   - hub_enterprise:  ¥280,000/月 → STRIPE_PRICE_HUB_ENTERPRISE
   */
  STRIPE_PRICE_ADDRESS_MANAGED?: string;
  /** Hub license Price ID — Hub Pro(¥120,000/月 flat)。 */
  STRIPE_PRICE_HUB_PRO?: string;
  /** Hub license Price ID — Hub Enterprise(¥280,000/月 flat)。 */
  STRIPE_PRICE_HUB_ENTERPRISE?: string;
  /** S1: /internal/stats Basic認証ユーザー名(Secret) */
  INTERNAL_STATS_USER?: string;
  /** S1: /internal/stats Basic認証パスワード(Secret) */
  INTERNAL_STATS_PASS?: string;
  /** S1: Cloudflare Account ID(Analytics Engine SQL API 用) */
  CF_ACCOUNT_ID?: string;
  /** S1: Account Analytics:Read のみ付与した最小権限APIトークン */
  CF_AE_READ_TOKEN?: string;
  /**
   * IndexNow protocol 用のキー(Secret)。
   * Bing / Yandex / Seznam / Naver 等の参加 search engine に push 型 indexing 要求するために使う。
   * IndexNow 仕様: 8〜128 文字の hex(英数字 + ダッシュ可)。
   * 検証ファイルは `https://shirabe.dev/{INDEXNOW_KEY}.txt` で配信(routes/indexnow.ts)。
   */
  INDEXNOW_KEY?: string;
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
