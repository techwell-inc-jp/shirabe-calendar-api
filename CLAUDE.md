# CLAUDE.md — Shirabe Calendar API 固有ルール

このファイルは暦API(`shirabe-calendar-api`)の固有ルール。
**親フォルダの `../CLAUDE.md`(全体共通ルール)を先に読んでから、本ファイルを適用すること。**

---

## 1. プロダクト概要

- **プロダクト名**: Shirabe Calendar API
- **リポジトリ**: `techwell-inc-jp/shirabe-calendar-api`(Public)
- **公開URL**: `https://shirabe.dev`
- **状態**: 本番稼働中、Phase 1-6完了、Phase 2結合テスト完了(2026/04/17)
- **概要**: 日本の暦情報(六曜・暦注・干支・二十四節気)と用途別吉凶判定を返すAPI
- **提供形態**: REST API + MCPサーバー

---

## 2. 現在の実装状況

### 完了済みPhase

- **Phase 1**: 匿名Free利用(APIキー不要で即利用可能)
- **Phase 2**: 月間利用量チェック + 自動アップグレード誘導
- **Phase 3**: Stripe Checkout + APIキー自動発行
- **Phase 4**: Stripe Webhook自動処理
- **Phase 5**: suspended対応
- **Phase 6**: 静的ページ群

### テスト状況

- 18 files / 244 tests / all passing
- 最新コミット: `d09030a`(KV TTL最小60sクランプ)
- **既存244テストを壊さないこと**

---

## 3. 技術スタック(暦API固有)

親フォルダCLAUDE.md「技術スタック」に加えて:

- **MCP SDK**: @modelcontextprotocol/sdk(TypeScript版)
- **暦計算**: 自前実装(`src/core/`)
- **暦データ**: 静的JSONファイル(`src/data/`)

---

## 4. ディレクトリ構成

```
shirabe-calendar/
├── src/
│   ├── index.ts              # Honoエントリポイント
│   ├── routes/               # APIエンドポイント
│   ├── core/                 # 暦計算コアエンジン
│   ├── data/                 # 定義データ(六曜、暦注等)
│   ├── middleware/           # 認証、レート制限
│   ├── billing/              # Stripe連携
│   └── mcp/                  # MCPサーバー
├── test/                     # テストファイル
├── scripts/                  # ユーティリティスクリプト
├── .claude/
│   └── settings.json         # Claude Code権限設定
├── .claudeignore             # Claude Codeに読み込ませないファイル
├── wrangler.toml             # Cloudflare Workers設定
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── CLAUDE.md                 # 本ファイル
```

---

## 5. インフラ情報(暦API)

### Cloudflare

| 項目 | 値 |
|---|---|
| Worker名 | shirabe-calendar-api |
| API_KEYS namespace ID | 3b6bfff407974b7cbf79ded8e184c1a6 |
| USAGE_LOGS namespace ID | 00229f606a27479cba182f9d9da5b39c |
| RATE_LIMITS namespace ID | ce837463bc6a41128509dc2a18c57087 |

### Stripe(本番)

| 項目 | 値 |
|---|---|
| メーターID | mtr_61UVPvw4ZyXAhCng841DV2wkNs8tVTeq |
| Starter Price ID | price_1TMbyCDV2wkNs8tVg4hLKnBv |
| Pro Price ID | price_1TMbz5DV2wkNs8tVldnGiCD9 |
| Enterprise Price ID | price_1TMbztDV2wkNs8tVXgJirL9S |
| Webhook URL | https://shirabe.dev/webhook/stripe |

---

## 6. 料金プラン

| プラン | 月間上限 | 単価 | 月額例 | レート制限 |
|---|---|---|---|---|
| Free | 10,000回 | 無料 | ¥0 | 1 req/s |
| Starter | 500,000回 | ¥0.05/回 | 50万回: ¥25,000 | 30 req/s |
| Pro | 5,000,000回 | ¥0.03/回 | 500万回: ¥150,000 | 100 req/s |
| Enterprise | 無制限 | ¥0.01/回 | 1,000万回: ¥100,000 | 500 req/s |

- 全プランFree枠10,000回/月、超過分から課金
- `transform_quantity[divide_by]=1000` 使用

---

## 7. APIキーフォーマット

- プレフィックス: `shrb_`
- 長さ: `shrb_` + 32文字 = 合計37文字
- 生成方法: Web Crypto API の `crypto.getRandomValues`

---

## 8. 既知の課題

### 課題1: X-Plan ヘッダー不具合(優先度低)

- `/api/v1/calendar/{date}` のレスポンスヘッダーに `X-Plan` が含まれない
- `X-RateLimit-Limit` は正しくプラン別の値を返すため、プラン判定自体は機能
- GitHub Issues で起票予定

---

## 9. 暦API固有の実装ルール

### Stripe Webhookの設計

- Webhookと `success_url` リダイレクトは**並列発火**する前提
- 「Webhookで一時データを削除」は危険 → TTLに任せる
- 署名検証は Web Crypto API のHMAC SHA-256で実装

### 認証・レート制限

- APIキー認証は `X-API-Key` ヘッダー
- レート制限は `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` をレスポンスヘッダーに付与
- `X-Plan` ヘッダー(`free`/`starter`/`pro`/`enterprise`)も付与すべき(現在バグあり)

### 暦計算

- 計算は純粋関数として実装
- テスト可能性を最優先
- 六曜・暦注・干支・二十四節気の計算ロジックは `src/core/` に集約

---

## 10. 参照ドキュメント

- **プロジェクト基準**: `../shirabe-assets/docs/master-plan.md`
- **本日の引き継ぎ**: `../shirabe-assets/docs/handoff_YYYYMMDD.md`
- **PRD・システム設計書**: `shirabe_calendar_api_prd.md`(リポジトリ内)
- **技術設計・実装手順書**: `ai_api_development_guide.md`(リポジトリ内)

---

## 11. デプロイ確認手順

1. GitHub Actions で緑を確認
2. `curl https://shirabe.dev/health` で動作確認
3. 問題あれば前コミットにrevertで即ロールバック

---

**親フォルダのCLAUDE.md(全体共通ルール)と本ファイル(暦API固有)を両方守ること。矛盾が生じた場合、親フォルダのルールが優先。**
