# Shirabe Calendar API

> 日本の暦（六曜・暦注・干支・二十四節気）と用途別吉凶判定を、**天文学的精度**で返す **AIネイティブREST API + MCPサーバー**。姉妹 API: [Shirabe Address API](https://github.com/techwell-inc-jp/shirabe-address-api)(日本住所正規化、abr-geocoder 公式エンジン API 化、**2026-05-01 リリース**)。
> Japan's calendar (rokuyo, rekichu auspicious days, kanshi, 24 solar terms) and purpose-specific auspicious-day judgments, served with **astronomical precision** as an **AI-native REST API + MCP server**. Sister API: [Shirabe Address API](https://github.com/techwell-inc-jp/shirabe-address-api) (Japanese address normalization, abr-geocoder API gateway, **launching 2026-05-01**).

[![Production v1.0.0](https://img.shields.io/badge/Production-v1.0.0-success)](https://github.com/techwell-inc-jp/shirabe-calendar-api/releases)
[![OpenAPI 3.1](https://img.shields.io/badge/OpenAPI-3.1-6BA539?logo=openapiinitiative&logoColor=white)](https://shirabe.dev/openapi.yaml)
[![MCP](https://img.shields.io/badge/MCP-supported-8A2BE2)](https://modelcontextprotocol.io/)
[![Cloudflare Workers](https://img.shields.io/badge/Runtime-Cloudflare_Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Tests](https://img.shields.io/badge/tests-520_passing-brightgreen)](./test)
[![License](https://img.shields.io/badge/License-Proprietary-red)](#ライセンス)

**Production URL**: `https://shirabe.dev` ・ **OpenAPI 3.1 仕様**: <https://shirabe.dev/openapi.yaml> ・ **MCP**: <https://shirabe.dev/mcp> ・ **公式サイト**: <https://shirabe.dev>

---

## 目次 / Table of Contents

- [これは何？ / What is this?](#これは何--what-is-this)
- [なぜShirabeか / Why Shirabe](#なぜshirabeか--why-shirabe)
- [クイックスタート（REST）](#クイックスタートrest)
- [AIエージェント統合（MCP / GPTs / Function Calling）](#aiエージェント統合mcp--gpts--function-calling)
- [エンドポイント一覧](#エンドポイント一覧)
- [レスポンス例](#レスポンス例)
- [ユースケース](#ユースケース)
- [料金プラン](#料金プラン)
- [認証とレート制限](#認証とレート制限)
- [エラーハンドリング](#エラーハンドリング)
- [精度と算出根拠](#精度と算出根拠)
- [技術スタック](#技術スタック)
- [ローカル開発](#ローカル開発)
- [ライセンス](#ライセンス)

---

## これは何？ / What is this?

**Shirabe Calendar API** は、日本の暦情報を**天文学的精度**で提供するAIネイティブAPIです。
六曜・暦注・干支・二十四節気・旧暦日付・和暦に加え、**8カテゴリの用途別吉凶判定とスコア**（結婚式・葬儀・引越し・着工・開業・納車・入籍・旅行）を1リクエストで返します。
OpenAPI 3.1 準拠。ChatGPT GPTs Actions / Claude Tool Use / Gemini Function Calling / LangChain / LlamaIndex / Dify など、主要AIフレームワークから即利用可能。

**Shirabe Calendar API** is an AI-native API serving Japanese calendar data with **astronomical precision**. It returns rokuyo, rekichu, kanshi, 24 solar terms, lunar date, Japanese era, plus **purpose-specific auspiciousness judgments with 1–10 scores** across 8 categories (wedding, funeral, moving, construction, business, car delivery, marriage registration, travel). Strict OpenAPI 3.1. Works out-of-the-box with ChatGPT GPTs Actions, Claude Tool Use, Gemini Function Calling, LangChain, LlamaIndex, and Dify.

### キーワード / Keywords

`六曜 API` `暦注 API` `大安 API` `一粒万倍日 API` `天赦日 API` `旧暦 API` `和暦 API` `干支 API` `二十四節気 API` `日本 暦 API` `結婚式 日取り API` `引越し 日取り API` `AI 暦` `LLM calendar` `rokuyo api` `japanese calendar api` `lucky days api` `auspicious days japan` `mcp server japan` `openapi japanese calendar`

---

## なぜShirabeか / Why Shirabe

**自前実装（LLMによる六曜計算コード生成）は頻繁に誤算します。** 旧暦の朔（新月）計算には天文学的精度が必要で、単純アルゴリズムでは対応不可です。Shirabeは天文学的に正確な旧暦エンジンを内蔵し、暦注の複雑な組み合わせ（一粒万倍日 × 天赦日など）も網羅します。

LLM-generated rokuyo/lunar calculation code is **known to miscalculate** because the underlying new-moon (saku) computation requires astronomical precision that simple heuristics fail to capture. Shirabe ships an astronomically accurate lunar engine and covers complex rekichu combinations.

| 観点 | 自前実装 | 他の無料API | **Shirabe** |
|---|---|---|---|
| 旧暦計算精度 | △（誤算頻発） | ○ | ◎（天文学的精度） |
| 暦注の網羅性 | ✗ | △ | ◎（13種以上） |
| 用途別吉凶判定（context/score） | ✗ | ✗ | ◎ |
| best-days 検索（目的別ランキング） | ✗ | ✗ | ◎ |
| HTTPS | N/A | △（HTTPのみも多い） | ◎ |
| OpenAPI 3.1 | N/A | ✗ | ◎（LLM自動発見可） |
| MCP / GPTs / Function Calling | ✗ | ✗ | ◎ |
| SLA・従量課金 | N/A | ✗ | ◎（Stripe自動課金） |
| エッジ分散 | N/A | ✗ | ◎（Cloudflare Workers） |

---

## クイックスタート（REST）

### 1. まず試す（認証不要、Free枠 月10,000回まで）

```bash
# 指定日の暦情報を取得 / Get calendar info for a specific date
curl "https://shirabe.dev/api/v1/calendar/2026-04-15"
```

### 2. APIキー付き呼び出し

```bash
# 指定日の暦情報
curl -H "X-API-Key: shrb_your_api_key" \
  "https://shirabe.dev/api/v1/calendar/2026-04-15"

# 結婚式に最適な日を検索（上位5件）
curl -H "X-API-Key: shrb_your_api_key" \
  "https://shirabe.dev/api/v1/calendar/best-days?purpose=wedding&start=2026-04-01&end=2026-12-31&limit=5"

# 期間内の大安・友引のみ一括取得
curl -H "X-API-Key: shrb_your_api_key" \
  "https://shirabe.dev/api/v1/calendar/range?start=2026-04-01&end=2026-04-30&filter_rokuyo=大安,友引"
```

### 3. TypeScript / JavaScript

```ts
const res = await fetch(
  "https://shirabe.dev/api/v1/calendar/best-days?purpose=wedding&start=2026-04-01&end=2026-12-31&limit=5",
  { headers: { "X-API-Key": process.env.SHIRABE_API_KEY! } }
);
const data = await res.json();
console.log(data.results[0]);
// { date: '2026-04-15', score: 9, judgment: '大吉',
//   note: '大安 × 一粒万倍日。結婚式に非常に良い日。',
//   rokuyo: '大安', rekichu: ['一粒万倍日'] }
```

### 4. Python

```python
import os, requests

r = requests.get(
    "https://shirabe.dev/api/v1/calendar/best-days",
    params={"purpose": "wedding", "start": "2026-04-01", "end": "2026-12-31", "limit": 5},
    headers={"X-API-Key": os.environ["SHIRABE_API_KEY"]},
    timeout=10,
)
r.raise_for_status()
print(r.json()["results"][0])
```

### 5. OpenAPI 3.1 仕様から自動生成

```bash
# OpenAPI 仕様をダウンロード / Download the OpenAPI spec
curl -O https://shirabe.dev/openapi.yaml

# openapi-generator などで任意言語のクライアント生成
npx @openapitools/openapi-generator-cli generate -i openapi.yaml -g typescript-fetch -o ./client
```

---

## AIエージェント統合（MCP / GPTs / Function Calling）

### Model Context Protocol（MCP）

`claude_desktop_config.json` に以下を追加するだけで、Claude Desktop から直接利用できます。

```json
{
  "mcpServers": {
    "shirabe-calendar": {
      "command": "npx",
      "args": ["-y", "@shirabe-api/calendar-mcp"],
      "env": { "SHIRABE_API_KEY": "shrb_your_api_key" }
    }
  }
}
```

Streamable HTTP 対応のクライアントは URL 直指定も可能です:

```json
{
  "mcpServers": {
    "shirabe-calendar": { "url": "https://shirabe.dev/mcp" }
  }
}
```

#### 公開MCPツール

| ツール名 | 説明 |
|---|---|
| `get_japanese_calendar` | 指定日の暦情報と用途別吉凶判定を取得 |
| `find_best_days` | 期間内から目的（結婚式・引越し等）に最適な日をランキングで返す |
| `get_calendar_range` | 日付範囲の暦情報を一括取得（六曜・暦注でフィルタ可） |

### ChatGPT GPTs Actions / Custom GPTs

GPT Builder の **"Create new action"** で、Import URL に以下を貼り付け:

```
https://shirabe.dev/openapi.yaml
```

Authentication は API Key（Header `X-API-Key`）を選択。これだけで、カスタムGPTがShirabeを自動呼び出しするようになります。

### Claude Tool Use / Anthropic SDK

OpenAPIを`anthropic` SDKのToolに変換する標準パターンで動作します。詳細は [docs/claude-tool-use.md](./docs/claude-tool-use.md)（準備中）を参照。

### Gemini Function Calling / LangChain / LlamaIndex / Dify

OpenAPI 3.1 の `operationId` とパラメータがそのまま関数シグネチャになるよう設計されています。各フレームワークの OpenAPI Loader をそのまま利用してください。

---

## エンドポイント一覧

全エンドポイントの完全仕様は **[OpenAPI 3.1](https://shirabe.dev/openapi.yaml)** に定義されています（description、x-llm-hint、example、recoveryHint を日英両言語で記載済み）。

### `GET /api/v1/calendar/{date}`

指定1日分の暦情報と8カテゴリの用途別吉凶判定を返す。

| パラメータ | 位置 | 必須 | 説明 |
|---|---|---|---|
| `date` | path | ✓ | `YYYY-MM-DD`、1873-01-01〜2100-12-31 |
| `categories` | query | — | 返却カテゴリをカンマ区切り絞り込み |

### `GET /api/v1/calendar/range`

`start`〜`end` の期間の暦情報を配列で返す（最大93日）。

| パラメータ | 必須 | 説明 |
|---|---|---|
| `start`, `end` | ✓ | `YYYY-MM-DD` |
| `filter_rokuyo` | — | `大安,友引` のようなカンマ区切り |
| `filter_rekichu` | — | `一粒万倍日,天赦日` のようなカンマ区切り |
| `category`, `min_score` | — | 用途スコア閾値絞り込み |

### `GET /api/v1/calendar/best-days`

用途別に、期間からスコア上位の日をランキングで返す（最大365日）。

| パラメータ | 必須 | 説明 |
|---|---|---|
| `purpose` | ✓ | `wedding` / `funeral` / `moving` / `construction` / `business` / `car_delivery` / `marriage_registration` / `travel` |
| `start`, `end` | ✓ | `YYYY-MM-DD` |
| `limit` | — | 1〜20、既定5 |
| `exclude_weekdays` | — | `土,日` や `sat,sun`（日英どちらも可） |

### `GET /health`

認証不要のヘルスチェック。監視系向け。

---

## レスポンス例

### `GET /api/v1/calendar/2026-04-15`

```json
{
  "date": "2026-04-15",
  "wareki": "令和8年4月15日",
  "dayOfWeek": { "ja": "水", "en": "Wed" },
  "kyureki": {
    "year": 2026, "month": 2, "day": 29,
    "isLeapMonth": false, "monthName": "如月"
  },
  "rokuyo": {
    "name": "大安",
    "reading": "たいあん",
    "description": "万事に吉。結婚式・契約・引越しなど何をするにも良い日。",
    "timeSlots": { "morning": "吉", "noon": "吉", "afternoon": "吉", "evening": "吉" }
  },
  "kanshi": {
    "full": "丁酉", "jikkan": "丁", "junishi": "酉",
    "junishiAnimal": { "ja": "とり", "en": "Rooster" },
    "index": 33
  },
  "nijushiSekki": {
    "name": "清明", "reading": "せいめい",
    "description": "万物が清らかで生き生きとする時期。",
    "isToday": false
  },
  "rekichu": [
    {
      "name": "一粒万倍日",
      "reading": "いちりゅうまんばいび",
      "description": "一粒の籾が万倍になるとされる吉日。新規の開始に適する。",
      "type": "吉"
    }
  ],
  "context": {
    "wedding":  { "judgment": "大吉", "note": "大安 × 一粒万倍日。結婚式に非常に良い日。", "score": 9 },
    "moving":   { "judgment": "吉",   "note": "大安は引越しに適する。",                     "score": 8 },
    "business": { "judgment": "大吉", "note": "一粒万倍日は開業・新規事業の吉日。",         "score": 9 }
  },
  "summary": "令和8年4月15日（水）大安・一粒万倍日。結婚式・開業に大吉の日。"
}
```

完全なレスポンス例・各フィールドの例・エラー例は **[OpenAPI 3.1 仕様](https://shirabe.dev/openapi.yaml)** の `examples` セクションで確認できます。

---

## ユースケース

### 1. 結婚式場AIチャットボット

「来月の土日で結婚式におすすめの日を5つ」→ `best-days?purpose=wedding&limit=5&exclude_weekdays=月,火,水,木,金`

### 2. 引越し業者の見積りAI

顧客希望日のスコアを返し、代替日を提案 → `calendar/{date}` で当日スコア + `range` でスコアの高い近傍日抽出

### 3. 占いSaaS

誕生日・入籍日から干支・六曜・暦注を自動解説 → `calendar/{date}` を連続呼び出し

### 4. カレンダーアプリのオーバーレイ

月間ビューに六曜・暦注を一括描画 → `range?start=...&end=...`

### 5. 業務自動化（RPA / エージェント）

請求書発行日を大安に自動設定、契約締結日を吉日にレコメンド、など

---

## 料金プラン

全プラン共通で **Free枠 月10,000回**。超過分から課金。`transform_quantity[divide_by]=1000` 方式。

| プラン | 月間上限 | 単価（超過分） | 月額例 | レート制限 |
|---|---|---|---|---|
| **Free** | 10,000回 | 無料 | ¥0 | 1 req/s |
| **Starter** | 500,000回 | ¥0.05/回 | 50万回: ¥25,000 | 30 req/s |
| **Pro** | 5,000,000回 | ¥0.03/回 | 500万回: ¥150,000 | 100 req/s |
| **Enterprise** | 無制限 | ¥0.01/回 | 1,000万回: ¥100,000 | 500 req/s |

契約・課金・停止・再開はすべてStripe Webhookで自動処理されます（人間オペ不要）。

---

## 認証とレート制限

### APIキー

`X-API-Key` ヘッダーに `shrb_` + 32文字の英数字キーを付与:

```
X-API-Key: shrb_a1b2c3d4e5f67890...
```

キーなしの場合は匿名Free枠（IP別 月10,000回）で動作します。

### レート制限ヘッダー

全レスポンスに以下を付与:

```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 29
X-RateLimit-Reset: 2026-04-15T12:00:01Z
X-Plan: starter
```

---

## エラーハンドリング

全エラーは共通形 `{ error: { code, message, details?, recoveryHint? } }` で返します。

```json
{
  "error": {
    "code": "INVALID_DATE",
    "message": "Date must be in YYYY-MM-DD format and between 1873-01-01 and 2100-12-31",
    "details": { "received": "2026/04/15" },
    "recoveryHint": "Reformat the date as YYYY-MM-DD (e.g. 2026-04-15) and resubmit."
  }
}
```

| HTTP | `code` | 復旧アクション |
|---|---|---|
| 400 | `INVALID_DATE` | 日付を `YYYY-MM-DD` 形式、1873-01-01〜2100-12-31 で再送 |
| 400 | `INVALID_PARAMETER` | `details.parameter` を仕様通り修正 |
| 401 | `INVALID_API_KEY` | `X-API-Key` を有効なキーに更新、またはヘッダー削除でFree枠利用 |
| 429 | `RATE_LIMIT_EXCEEDED` | `Retry-After` 秒後に再送、または上位プランへ |
| 500 | `INTERNAL_ERROR` | 指数バックオフで1-2回まで再試行。恒常的なら support@shirabe.dev |

詳細は OpenAPI 仕様の `ErrorCode` セクションを参照。

---

## 精度と算出根拠

- **旧暦・朔の計算**: 天文アルゴリズム（月齢・太陽黄経）ベースの自前実装。単純な60日周期テーブルは使用しません。
- **六曜**: 旧暦月日から決定的に導出（旧暦1/1→先勝、2/1→友引、...の規則）。
- **暦注**: 一粒万倍日・天赦日・大明日・寅の日・巳の日・己巳の日・甲子の日・母倉日・天恩日・不成就日・三隣亡・受死日・十死日の13種を網羅。
- **二十四節気**: 太陽黄経15度間隔で算出、当日判定（`isToday`）付き。
- **干支**: 60干支の完全サイクル、十干・十二支・動物ラベル。
- **対応範囲**: 1873-01-01 〜 2100-12-31（明治6年の改暦以降）。

Algorithms and methodology details are published as part of the [OpenAPI spec](https://shirabe.dev/openapi.yaml) and verified by 326 unit tests (see `test/core/`).

---

## 技術スタック

- **ランタイム**: Cloudflare Workers（エッジ分散）
- **フレームワーク**: Hono
- **言語**: TypeScript（strict mode）
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **課金**: Stripe Billing（従量課金、メーター + `transform_quantity`）
- **KV**: Cloudflare KV（APIキー・レート制限・キャッシュ）
- **計測**: Cloudflare Analytics Engine（AI/人間UA分類、AI検索Referrer分類）
- **テスト**: Vitest（326 tests, all passing）
- **CI/CD**: GitHub Actions
- **監視**: BetterStack

---

## ローカル開発

```bash
# 依存関係
pnpm install

# 開発サーバー
pnpm run dev

# テスト実行
pnpm run test              # 326 tests

# 型チェック
pnpm run typecheck

# npm パッケージ用 CLI ビルド
pnpm run build:cli
```

デプロイは GitHub Actions 経由のみ（`wrangler deploy` 直接実行は禁止）。

---

## プロジェクトの設計思想（AIネイティブAPI）

Shirabe Calendar API は **「生成AIが勝手に使い出す」** ことを判断基準に設計されています。

1. **AIが主利用者**: 1タスクで10〜50リクエストを連鎖する前提の設計。
2. **構造化データ優先**: OpenAPI 3.1、MCP、Function Calling への即対応。
3. **人間向けSaaSの発想を排除**: サインアップ画面なし、ダッシュボードなし、設定画面なし。すべてAPI・環境変数で完結。
4. **自動スケール**: 契約・課金・停止・復帰をStripe Webhookで完全自動化。

This is an AI-native API: designed to be discovered and consumed by LLMs and autonomous agents, not by humans through a dashboard UI.

---

## 姉妹 API / Related APIs(shirabe.dev プラットフォーム）

shirabe.dev は「日本特化 AI ネイティブ API プラットフォーム」として、暦 API に続く API 群を順次公開しています。同一ドメイン・同一の Stripe 課金 / API キー基盤・統一 OpenAPI 3.1 スタイルで、複数 API のクロスセル連携が可能です。

| API | 状態 | 概要 |
|---|---|---|
| [Shirabe Calendar API](https://github.com/techwell-inc-jp/shirabe-calendar-api) | ✅ 本番稼働中 | 六曜・暦注・干支・二十四節気・用途別吉凶(本リポジトリ) |
| [Shirabe Address API](https://github.com/techwell-inc-jp/shirabe-address-api) | 🚀 **2026-05-01 リリース** | 日本住所正規化、abr-geocoder 公式エンジン API 化、CC BY 4.0 attribution required |
| [Shirabe Text API](https://github.com/techwell-inc-jp/shirabe-text-api) | 🚀 **2026-05-31 リリース予定** | 姓名分割・人名読み推定・ふりがな付与・形態素解析・表記正規化(Lindera + IPAdic) |

### 統合アクセス

- 統合 OpenAPI 3.1 ディスカバリ: <https://shirabe.dev/llms.txt>(LLM 向けサイト要約、全 API のエンドポイント・curl 例網羅)
- 同一 API キー(`shrb_*` プレフィックス)で全 API にアクセス可能
- Free 枠は API 別(暦: 月 10,000 回 / 住所: 月 5,000 回)

---

## ライセンス

- **APIサービス本体**: Proprietary（商用利用は有料プランに従う）
- **本リポジトリのサンプルコード・クライアント例**: MIT
- **利用規約**: <https://shirabe.dev/terms>
- **連絡先**: <support@shirabe.dev>

---

## 関連リンク

- **本番API**: <https://shirabe.dev>
- **OpenAPI 3.1 仕様**: <https://shirabe.dev/openapi.yaml>
- **MCP エンドポイント**: <https://shirabe.dev/mcp>
- **ヘルスチェック**: <https://shirabe.dev/health>
- **姉妹 API: 住所 API**(2026-05-01 リリース): <https://github.com/techwell-inc-jp/shirabe-address-api> ・ Docs: <https://shirabe.dev/docs/address-normalize> ・ OpenAPI: <https://shirabe.dev/api/v1/address/openapi.yaml>
- **LLM 向けサイト要約**: <https://shirabe.dev/llms.txt>
- **運営**: 株式会社テックウェル（福岡）/ Techwell Inc., Fukuoka, Japan

---

<!--
  JSON-LD structured data for AI crawlers and search engines.
  Visible to GitHub's content indexers and LLM training crawlers.
-->
<details>
<summary>Structured data (JSON-LD for AI crawlers)</summary>

```json
{
  "@context": "https://schema.org",
  "@type": "APIReference",
  "name": "Shirabe Calendar API",
  "description": "AI-native REST API and MCP server for Japanese calendar (rokuyo, rekichu, kanshi, 24 solar terms) with purpose-specific auspiciousness judgments.",
  "url": "https://shirabe.dev",
  "documentation": "https://shirabe.dev/openapi.yaml",
  "programmingModel": "REST",
  "targetProduct": {
    "@type": "SoftwareApplication",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Cross-platform"
  },
  "provider": {
    "@type": "Organization",
    "name": "Techwell Inc.",
    "address": "Fukuoka, Japan",
    "url": "https://shirabe.dev"
  },
  "keywords": [
    "rokuyo", "六曜", "rekichu", "暦注", "kanshi", "干支",
    "lunar calendar", "旧暦", "Japanese calendar API",
    "lucky days", "auspicious days", "wedding dates Japan",
    "MCP server", "OpenAPI 3.1", "AI-native API",
    "ChatGPT GPTs", "Claude Tool Use", "Function Calling"
  ]
}
```

</details>
