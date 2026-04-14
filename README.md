# Shirabe Calendar API

日本の暦情報（六曜・暦注・干支・二十四節気）と用途別吉凶判定を返す REST API + MCP サーバー。

AIエージェント（Claude、ChatGPT 等）が直接呼び出せる MCP 対応と、コンテキスト付きレスポンスが特長です。

## クイックスタート

### 1. APIキーを取得

[shirabe.dev](https://shirabe.dev) でアカウントを作成し、APIキーを取得してください（Free プランは月1,000リクエストまで無料）。

### 2. APIを呼び出す

```bash
# 指定日の暦情報を取得
curl -H "X-API-Key: shrb_your_api_key" \
  "https://api.shirabe.dev/api/v1/calendar/2026-11-15"

# 結婚式に最適な日を検索
curl -H "X-API-Key: shrb_your_api_key" \
  "https://api.shirabe.dev/api/v1/calendar/best-days?purpose=wedding&start=2026-11-01&end=2027-03-31&limit=5"

# 日付範囲の大安を一括取得
curl -H "X-API-Key: shrb_your_api_key" \
  "https://api.shirabe.dev/api/v1/calendar/range?start=2026-11-01&end=2026-11-30&filter_rokuyo=大安"
```

### 3. MCP で使う（Claude Desktop）

#### 方法 A: npm パッケージ（推奨）

```bash
npm install -g @shirabe/calendar-mcp
```

`claude_desktop_config.json` に以下を追加:

```json
{
  "mcpServers": {
    "shirabe-calendar": {
      "command": "npx",
      "args": ["-y", "@shirabe/calendar-mcp"],
      "env": {
        "SHIRABE_API_KEY": "shrb_your_api_key"
      }
    }
  }
}
```

#### 方法 B: リモート MCP サーバー（URL 直接指定）

Streamable HTTP 対応のクライアントでは URL を直接指定できます:

```json
{
  "mcpServers": {
    "shirabe-calendar": {
      "url": "https://shirabe.dev/mcp"
    }
  }
}
```

設定後、Claude に「明日の六曜は？」「来月の結婚式に最適な日は？」と聞くだけで暦情報を取得できます。

---

## API エンドポイント

### `GET /api/v1/calendar/{date}`

指定日の暦情報をすべて返します。

| パラメータ | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `date` | path (YYYY-MM-DD) | Yes | 対象日付 |
| `categories` | query (カンマ区切り) | No | 吉凶判定カテゴリ（省略時は全カテゴリ） |
| `lang` | query | No | `ja`（デフォルト）または `en` |

### `GET /api/v1/calendar/range`

日付範囲の暦情報を一括取得します。

| パラメータ | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `start` | query (YYYY-MM-DD) | Yes | 開始日 |
| `end` | query (YYYY-MM-DD) | Yes | 終了日（最大93日間） |
| `filter_rokuyo` | query | No | 六曜フィルタ（例: `大安`） |
| `filter_rekichu` | query | No | 暦注フィルタ（例: `天赦日`） |
| `category` | query | No | カテゴリフィルタ（例: `wedding`） |
| `min_score` | query | No | 最低スコア（1〜10） |

### `GET /api/v1/calendar/best-days`

指定用途に最適な日をランキングで返します。

| パラメータ | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `purpose` | query | Yes | 用途（`wedding` / `funeral` / `moving` / `construction` / `business` / `car_delivery` / `marriage_registration` / `travel`） |
| `start` | query (YYYY-MM-DD) | Yes | 開始日 |
| `end` | query (YYYY-MM-DD) | Yes | 終了日（最大365日間） |
| `limit` | query | No | 返す件数（デフォルト5、最大20） |
| `exclude_weekdays` | query | No | 除外曜日（例: `月,火`） |

### `GET /health`

ヘルスチェック。認証不要。

---

## レスポンス例

### 単日取得

```json
{
  "date": "2026-11-15",
  "wareki": "令和8年11月15日",
  "day_of_week": {
    "ja": "日曜日",
    "en": "Sunday"
  },
  "kyureki": {
    "year": 2026,
    "month": 10,
    "day": 1,
    "is_leap_month": false,
    "month_name": "神無月"
  },
  "rokuyo": {
    "name": "大安",
    "reading": "たいあん",
    "description": "終日吉。万事に良い日",
    "time_slots": {
      "morning": "吉",
      "noon": "吉",
      "afternoon": "吉",
      "evening": "吉"
    }
  },
  "kanshi": {
    "full": "丙辰",
    "jikkan": "丙",
    "junishi": "辰",
    "junishi_animal": {
      "ja": "龍",
      "en": "Dragon"
    }
  },
  "nijushi_sekki": {
    "name": "立冬",
    "reading": "りっとう",
    "description": "冬の始まり。冬の気配が立ち始める頃",
    "is_today": false
  },
  "rekichu": [
    {
      "name": "一粒万倍日",
      "reading": "いちりゅうまんばいび",
      "description": "始めたことが万倍に膨らむ吉日。開業・入籍・種まきに最適",
      "type": "吉"
    }
  ],
  "context": {
    "結婚": {
      "judgment": "大吉",
      "note": "大安と一粒万倍日が重なる最良の日。終日吉のため時間帯の制約もなし",
      "score": 10
    }
  },
  "summary": "大安と一粒万倍日が重なる大変縁起の良い日です。結婚式・入籍・開業など、新しいことを始めるのに最適です。"
}
```

---

## MCP ツール

Shirabe Calendar API は以下の3つの MCP ツールを公開しています。

| ツール名 | 説明 |
|---------|------|
| `get_japanese_calendar` | 指定日の暦情報（六曜・暦注・干支・二十四節気）と吉凶判定を取得 |
| `find_best_days` | 指定用途に最適な日を期間内から検索してランキングで返す |
| `get_calendar_range` | 日付範囲の暦情報を一括取得（六曜・暦注でフィルタ可能） |

---

## 料金プラン

| プラン | 単価 | リクエスト/月 | レート制限 |
|-------|------|-------------|-----------|
| **Free** | 無料（月1,000回まで） | 1,000 | 1 req/s |
| **Starter** | 1円/回（月1,000回まで無料） | 50,000 | 10 req/s |
| **Pro** | 1円/回（月1,000回まで無料） | 500,000 | 50 req/s |
| **Enterprise** | 1円/回（月1,000回まで無料） | 無制限 | 100 req/s |

プラン間の差別化は「月間リクエスト上限」と「レート制限」で行います。

---

## 認証

すべての API リクエストに `X-API-Key` ヘッダーが必要です（`/health` を除く）。

```
X-API-Key: shrb_a1b2c3d4e5f6...
```

レスポンスヘッダーにレート制限情報が含まれます:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 2026-05-01T00:00:00Z
```

---

## エラーレスポンス

```json
{
  "error": {
    "code": "INVALID_DATE",
    "message": "Date must be in YYYY-MM-DD format and between 1873-01-01 and 2100-12-31",
    "details": { "received": "2026-13-01" }
  }
}
```

| ステータス | コード | 説明 |
|-----------|-------|------|
| 400 | `INVALID_DATE` | 日付形式が不正、または範囲外 |
| 401 | `INVALID_API_KEY` | APIキーが無効または未指定 |
| 429 | `RATE_LIMIT_EXCEEDED` | レート制限超過 |
| 500 | `INTERNAL_ERROR` | サーバー内部エラー |

---

## 技術スタック

- **ランタイム**: Cloudflare Workers
- **フレームワーク**: Hono
- **言語**: TypeScript (strict mode)
- **MCP SDK**: @modelcontextprotocol/sdk
- **課金**: Stripe Billing
- **KV**: Cloudflare KV
- **テスト**: Vitest（171テスト）

## ローカル開発

```bash
# 依存関係インストール
pnpm install

# 開発サーバー起動
pnpm run dev

# テスト実行
pnpm run test

# 型チェック
pnpm run typecheck

# npm パッケージ用 CLI ビルド
pnpm run build:cli
```

## ライセンス

Proprietary. All rights reserved.

MCP クライアント連携のサンプルコードは MIT ライセンスで提供します。
