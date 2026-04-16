# Shirabe API — 最終引き継ぎ + 実装指示書（2026年4月15日）

## ⚠️ 全ての設計・実装判断に適用する絶対ルール

以下の3つに違反する設計・実装は不合格とする。
「後で対応」「スケールしてから」「手動で運用」は全てルール違反。

### ルール1: AIが使うことを前提に設計する
- 利用者は人間ではなくAIエージェント。1タスクで10〜50リクエストを連鎖する
- AI SaaS企業が月数十万〜数百万回呼ぶことを前提とした料金・レート設計
- 人間向けSaaSの発想（サインアップ画面でメール入力等）は禁止

### ルール2: 人間の手動運用はゼロ
- 契約・課金・停止・復帰は全てWebhookで自動処理
- 「手動でKVを編集」「ダッシュボードで確認」は運用ではなく障害対応時のみ

### ルール3: 初期実装で全て完結させる
- 有料顧客ゼロの段階で課金パイプラインが全自動で動く状態にする
- 「顧客が増えてから考える」は禁止

---

## 1. プロジェクト概要

Shirabe API（shirabe.dev）— 日本特化のデータAPIプラットフォーム。
AIエージェント（Claude、ChatGPT、各社AI SaaS等）が自動的に発見・利用し、従量課金で収益が自動拡大するビジネスモデル。
第1弾: 暦API（六曜・暦注・干支・二十四節気・吉凶判定）。株式会社テックウェル（福岡）が運営。

### ビジネスモデル

```
AI DISCOVERY LAYER（MCPレジストリ / OpenAPI / GitHub）
        ↓ AIが自動で発見
AI AGENTS（ChatGPT / Claude / 各社AIエージェント / AI SaaS）
        ↓ バックエンドから繰り返し呼び出し
従量課金で自動スケール（利用量 × 単価 = 収益）
```

- マーケティング不要（AIが自動認知）
- CAC実質ゼロ（組み込まれたら継続）
- 人間の手動運用ゼロ

---

## 2. 技術スタック

TypeScript / Hono / Cloudflare Workers / Stripe（従量課金） / GitHub Actions（CI/CD）

---

## 3. 完了済みタスク

### 開発・インフラ
- Phase 1〜4 開発完了（171テスト合格）
- shirabe.dev 本番稼働中（Cloudflare Workers）
- 静的ページ4つ（/, /terms, /privacy, /legal）デプロイ済み
- Email Routing（support@shirabe.dev → r.yoshikawa@techwell.jp）
- GitHub リポジトリ Public化（techwell-inc-jp/shirabe-calendar-api）
- GitHub 2FA設定完了（Shirabe-dev-sys アカウント）
- BetterStack監視設定（Freeプラン、3分間隔、shirabe.dev/health）

### Stripe
- Stripe「Shirabe」アカウント + メーター + 商品3つ（Starter/Pro/Enterprise）
- 本番メーター: 「API リクエスト」（イベント名: `api_requests`、集計: 合計）
- 料金: **新料金体系に変更（旧1円/回は廃止）。Stripeの商品・価格を再作成する必要あり**

新料金体系:

| プラン | 月間上限 | 単価 | 月額例 | レート制限 |
|--------|---------|------|-------|----------|
| Free | 10,000回 | 無料 | ¥0 | 1 req/s |
| Starter | 500,000回 | ¥0.05/回 | 10万回: ¥5,000 / 50万回: ¥25,000 | 30 req/s |
| Pro | 5,000,000回 | ¥0.03/回 | 100万回: ¥30,000 / 500万回: ¥150,000 | 100 req/s |
| Enterprise | 無制限 | ¥0.01/回 | 1,000万回: ¥100,000 | 500 req/s |

- 全プランFree枠10,000回/月は無料。超過分から課金開始
- **Stripeの`transform_quantity[divide_by]=1000`を使用** → リクエスト数をそのまま報告し、Stripe側で÷1,000して課金
- 日次バッチスクリプトの変更不要（カウントをそのまま送信）
- JPY整数制約クリア（課金単位は1,000回ごと）
- Graduated（段階制）でFree枠10,000回=¥0、以降プラン別単価を1つの価格で設定可能
- **Stripeの商品・価格を新料金で再作成する必要あり（旧1円/回の商品は廃止）**

Stripe価格の設定値:

| プラン | transform_quantity[divide_by] | unit_amount (JPY) | 段階1 (0〜10,000) | 段階2 (10,001〜上限) |
|--------|-------------------------------|-------------------|-------------------|---------------------|
| Starter | 1,000 | ¥50 | ¥0（Free枠） | ¥50/1,000回 |
| Pro | 1,000 | ¥30 | ¥0（Free枠） | ¥30/1,000回 |
| Enterprise | 1,000 | ¥10 | ¥0（Free枠） | ¥10/1,000回 |
- Stripeサンドボックスで課金連携テスト完了（2026/04/15）
- 日次バッチスクリプトを旧Usage Records API → 新Billing Meter Events APIに移行済み（コミット: ff91252）
- Stripe通知設定:「成功した支払い」メール通知ON

### AI Discovery Layer
- MCPレジストリ登録: Smithery（公開完了）、Glama.ai（審査通過・掲載済み）
- awesome-mcp-servers PR #4781（チェック通過・マージ待ち）
- npm パッケージ公開: @shirabe-api/calendar-mcp@1.0.0
- OpenAPI 3.1仕様公開（https://shirabe.dev/openapi.yaml）
- ChatGPT GPTs「Shirabe 暦カレンダー」作成・公開・動作確認済み
- Gemini Function Calling対応確認済み（既存REST + OpenAPIで対応）

---

## 4. V1残タスクの棚卸し（V2方針で再評価）

| V1タスク | V2での判断 | 理由 |
|---------|-----------|------|
| ~~Stripe課金連携テスト~~ | ✅ 完了 | 2026/04/15完了 |
| GitHub Actions Node.js 24移行 | **実装時に対応** | Phase実装と同時にCI設定を更新する（6月期限） |
| awesome-mcp-servers PR #4781 マージ確認 | **確認のみ** | 外部依存。マージされればDiscovery Layer強化 |
| mcp.so 掲載確認（Issue #2070） | **確認のみ** | 外部依存。掲載されればDiscovery Layer強化 |
| 本番 stripe:customer-map 運用フロー | **Phase 4で自動化** | Webhook自動処理で手動運用を完全排除 |
| Stripe決済失敗の検知強化 | **Phase 4で自動化** | Webhookで自動検知→APIキー自動停止 |
| GitHub Secrets STRIPE_SECRET_KEY 確認 | **実装時に確認** | 新APIで動作するか実装時にテスト |
| Cloudflare APIトークン整理 | **実装時に整理** | 不要なトークンがあれば削除 |

**結論: 「後回し」は一切なし。全てPhase実装の中で解決する。**

---

## 5. 実装すべき全タスク（Phase 1〜6）

### Phase 1: 匿名Free利用（APIキー不要化）— 最優先

**目的:** AIが発見→即利用できる摩擦ゼロ環境を作る。

**現状の問題:** 全APIリクエストにX-API-Keyヘッダーが必須。MCPレジストリで発見しても、APIキーがなければ使えない。

**変更ファイル:** `src/middleware/auth.ts`

APIキーヘッダーがない場合、401を返さず「匿名Freeユーザー」として処理する。

```typescript
export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const apiKey = c.req.header("X-API-Key");

  if (!apiKey) {
    // 匿名Freeユーザー（IPベース識別）
    c.set("plan", "free");
    c.set("customerId", await getAnonymousId(c));
    c.set("apiKeyHash", "");
    await next();
    return;
  }

  // APIキーあり → 既存の認証ロジック（変更なし）
  // ...
}
```

**匿名ユーザーの識別（`getAnonymousId`）:**
- `CF-Connecting-IP` ヘッダーからIPアドレス取得
- SHA-256ハッシュ化 → `anon_{hash先頭16文字}`
- これを `customerId` として利用量ログに記録

**匿名ユーザーのレート制限:** 1 req/s（Free相当）

**完了条件:** `X-API-Key`ヘッダーなしで `/api/v1/calendar/2026-04-15` が正常レスポンスを返すこと。MCP経由でもAPIキーなしで動くこと。

---

### Phase 2: 月間利用量チェック + 自動アップグレード誘導

**目的:** 月1,000回超過で自動的に有料化を促す。

**新規ファイル:** `src/middleware/usage-check.ts`

**処理:**
1. 月間カウントキー `usage-monthly:{customerId}:{YYYY-MM}` を追加（TTL: 35日）
2. リクエスト時にカウント取得→プラン上限と比較
3. 超過時:

```json
{
  "error": {
    "code": "USAGE_LIMIT_EXCEEDED",
    "message": "Free plan limit (10,000 requests/month) reached. Upgrade to continue.",
    "upgrade_url": "https://shirabe.dev/upgrade"
  }
}
```
HTTP 429 返却。

**有料プランも同様に制御:**
- Starter: 500,000回、Pro: 5,000,000回、Enterprise: 無制限

**ミドルウェア実行順序:**
```
auth → usage-check → rate-limit → usage-logger → route handler
```

**usage-logger.ts にも変更:** 月間カウントのインクリメントを追加。

---

### Phase 3: Stripe Checkout + APIキー自動発行

**目的:** 決済とAPIキー発行を一体化。ワンフローで完結。

**新規ファイル:** `src/routes/checkout.ts`

**エンドポイント:** `POST /api/v1/checkout`

**リクエスト:**
```json
{ "email": "user@example.com", "plan": "starter" }
```

**処理:**
1. バリデーション（メール形式、プラン名）
2. APIキー事前生成: `shrb_` + 32文字ランダム英数字
3. SHA-256ハッシュ化
4. Stripe Checkout Session 作成（`fetch` で直接呼ぶ。stripe npmパッケージは使わない）:
   - `mode: "subscription"`
   - `metadata: { apiKeyHash, plan }`
   - `success_url: "https://shirabe.dev/checkout/success?session_id={CHECKOUT_SESSION_ID}"`
5. KV USAGE_LOGS に一時保存: `checkout-pending:{apiKeyHash}` → `{"apiKey":"shrb_xxx","plan":"starter","email":"..."}` TTL:1時間
6. Checkout URLを返却

**レスポンス:**
```json
{ "checkout_url": "https://checkout.stripe.com/c/pay/cs_xxx..." }
```

**`GET /checkout/success`:**
- `session_id` パラメータからStripe Session取得
- `metadata.apiKeyHash` で pending データからAPIキー平文を取得
- 画面に表示（**二度と表示されない旨を警告**）
- MCP設定例のスニペットも表示

---

### Phase 4: Stripe Webhook自動処理

**目的:** 全課金ライフサイクルを自動管理。人間の介在ゼロ。

**新規ファイル:** `src/routes/webhook.ts`

**エンドポイント:** `POST /webhook/stripe`（auth/rate-limitバイパス。Stripe署名検証のみ）

**Stripe署名検証:** Web Crypto API の HMAC SHA-256 で実装。

**イベント処理:**

| イベント | 処理 |
|---------|------|
| `checkout.session.completed` | KV API_KEYS にAPIキー登録、stripe:customer-map更新、stripe-reverse登録、email登録、pending削除 |
| `invoice.payment_failed` | KV API_KEYS の status → "suspended" |
| `invoice.payment_succeeded` | status が suspended なら → "active" に復帰 |
| `customer.subscription.deleted` | plan → "free"に降格、Stripe関連フィールド削除、customer-map/reverse削除 |

**逆引き用マッピング（Webhook処理で必要）:**
- `stripe-reverse:{cus_xxx}` → `{customerId},{apiKeyHash}`
- `email:{email}` → `{apiKeyHash}`

---

### Phase 5: auth.ts拡張（suspended対応）

**変更ファイル:** `src/middleware/auth.ts`

APIキーの `status === "suspended"` で HTTP 403:
```json
{
  "error": {
    "code": "API_KEY_SUSPENDED",
    "message": "API key suspended due to payment failure. Update payment at: https://shirabe.dev/billing"
  }
}
```

---

### Phase 6: 静的ページ追加

**新規ファイル:**
- `src/pages/upgrade.ts` — プラン比較表 + メール入力 + Checkout遷移
- `src/pages/checkout-success.ts` — APIキー表示 + MCP設定例
- `src/pages/checkout-cancel.ts` — キャンセルメッセージ + /upgradeリンク

---

## 6. 型定義の変更

### env.ts
```typescript
export type Env = {
  API_KEYS: KVNamespace;
  RATE_LIMITS: KVNamespace;
  USAGE_LOGS: KVNamespace;
  API_VERSION: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_STARTER?: string;
  STRIPE_PRICE_PRO?: string;
  STRIPE_PRICE_ENTERPRISE?: string;
};
```

### ApiKeyInfo（auth.ts）
```typescript
export type ApiKeyInfo = {
  plan: "free" | "starter" | "pro" | "enterprise";
  customerId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  email?: string;
  status?: "active" | "suspended";  // 未設定は "active" 扱い
  createdAt: string;
};
```

---

## 7. ルーティング追加（index.ts）

```typescript
// 認証不要（authミドルウェアをバイパス）
app.post("/api/v1/checkout", checkoutHandler);
app.post("/webhook/stripe", webhookHandler);  // Stripe署名検証のみ
app.get("/upgrade", upgradePage);
app.get("/checkout/success", checkoutSuccessPage);
app.get("/checkout/cancel", checkoutCancelPage);
```

---

## 8. Secrets / 環境変数の追加

### wrangler.toml [vars]
```toml
STRIPE_PRICE_STARTER = "price_xxx"
STRIPE_PRICE_PRO = "price_xxx"
STRIPE_PRICE_ENTERPRISE = "price_xxx"
```

### Secrets（wrangler secret put または GitHub Secrets）
- `STRIPE_WEBHOOK_SECRET`

### 既存（確認が必要）
- `STRIPE_SECRET_KEY` — 本番キーが新Meter Events APIに対応しているか確認
- `CLOUDFLARE_API_TOKEN` — 日次バッチ用
- `CLOUDFLARE_ACCOUNT_ID` — `e23b560b7a00ce93fb33faa6cc7bc244`

---

## 9. 実装順序と完了条件

| 順序 | Phase | 完了条件 | ビジネスインパクト |
|------|-------|---------|------------------|
| 1 | Phase 1 | APIキーなしでAPI/MCPが使える | **AIが即利用可能になる** |
| 2 | Phase 2 | 10,001回目で429+upgrade_url | 有料化への自動誘導 |
| 3 | Phase 5 | suspended APIキーで403 | 未払い顧客の自動ブロック |
| 4 | Phase 6 | /upgradeページ表示 | 決済導線の設置 |
| 5 | Phase 3 | Checkout→APIキー表示 | 有料契約の受付開始 |
| 6 | Phase 4 | 全WebhookでKV自動更新 | **課金パイプライン完全自動化** |

---

## 10. stripe:customer-map の形式（日次バッチ用）

日次バッチスクリプト（`scripts/stripe-daily-report.ts`）が参照する形式:

```json
{
  "customerId": {
    "stripeCustomerId": "cus_xxx"
  }
}
```

**日次バッチの報告単位: 変更不要**
- Stripeの`transform_quantity[divide_by]=1000`を使用するため、カウント数はそのまま送信でよい
- Stripe側が自動で÷1,000して課金する
- 端数処理: Stripe側の`transform_quantity[round]=up`で自動切り上げ
- 既存の日次バッチスクリプト（`scripts/stripe-daily-report.ts`）の修正は不要

Phase 4のWebhook処理で `checkout.session.completed` 時に自動登録される。

---

## 11. KVキー設計一覧

| KV namespace | キーパターン | 値 | 用途 |
|-------------|------------|-----|------|
| API_KEYS | `{sha256hash}` | ApiKeyInfo JSON | APIキー認証 |
| USAGE_LOGS | `usage:{customerId}:{YYYY-MM-DD}` | カウント数 | 日次利用量（Stripe報告用） |
| USAGE_LOGS | `usage-index:{YYYY-MM-DD}` | カンマ区切りcustomerIdリスト | 日次バッチ用インデックス |
| USAGE_LOGS | `usage-monthly:{customerId}:{YYYY-MM}` | カウント数 | 月間利用量（上限チェック用）**新規** |
| USAGE_LOGS | `stripe:customer-map` | JSON | 日次バッチ用マッピング |
| USAGE_LOGS | `stripe-reverse:{cus_xxx}` | `{customerId},{apiKeyHash}` | Webhook逆引き用 **新規** |
| USAGE_LOGS | `email:{email}` | `{apiKeyHash}` | メール重複防止 **新規** |
| USAGE_LOGS | `checkout-pending:{apiKeyHash}` | JSON（TTL:1h） | Checkout完了待ち一時データ **新規** |
| RATE_LIMITS | `{customerId}:{window}` | カウント数 | レート制限 |

---

## 12. テスト方針

| Phase | テスト内容 |
|-------|----------|
| 1 | `X-API-Key`なしで`/api/v1/calendar/2026-04-15`が200を返す |
| 1 | MCP経由でAPIキーなしで暦情報が取得できる |
| 2 | 匿名Freeで10,001回目が429 + `upgrade_url`を含む |
| 2 | Starterプランで500,001回目が429 |
| 3 | `/api/v1/checkout`でStripe Checkout URLが返る |
| 3 | `/checkout/success`でAPIキーが表示される |
| 4 | `checkout.session.completed`でKV API_KEYSにエントリ作成 |
| 4 | `invoice.payment_failed`でstatusがsuspended |
| 4 | `customer.subscription.deleted`でplanがfreeに降格 |
| 4 | `invoice.payment_succeeded`でsuspendedからactive復帰 |
| 5 | `status:"suspended"`のAPIキーで403 |

---

## 13. 制約事項

- `wrangler deploy` は禁止。デプロイはGitHub Actions経由のみ
- CLAUDE.md のセキュリティルールに従うこと
- 既存の171テストを壊さないこと。新規テストを追加すること
- Cloudflare Workers の制限（CPU時間、サブリクエスト数）に注意
- Stripe SDK（stripe npmパッケージ）はWorkerで使えない可能性あり。`fetch`でStripe REST APIを直接呼ぶこと
- git remote: `https://github.com/techwell-inc-jp/shirabe-calendar-api.git`
- Cloudflare Account ID: `e23b560b7a00ce93fb33faa6cc7bc244`
- USAGE_LOGS namespace ID: `00229f606a27479cba182f9d9da5b39c`
- API_KEYS namespace ID: `3b6bfff407974b7cbf79ded8e184c1a6`
