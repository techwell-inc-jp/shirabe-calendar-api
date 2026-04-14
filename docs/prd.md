# Shirabe Calendar API — PRD & システム設計書

> Claude Codeでの実装を前提とした要件定義・システム設計ドキュメント
> 本ドキュメントをClaude Codeに渡して実装を開始できるレベルで記述する

---

## 0. プロダクト概要

| 項目 | 内容 |
|------|------|
| プロダクト名 | Shirabe Calendar API |
| ブランド | Shirabe（shirabe.dev） |
| 概要 | 日本の暦情報（六曜・暦注・干支・二十四節気）と用途別吉凶判定を返すAPI |
| 提供形態 | REST API + MCPサーバー |
| 差別化 | AIエージェントが直接呼べるMCP対応 + コンテキスト付きレスポンス |
| 技術スタック | TypeScript / Hono / Cloudflare Workers / MCP SDK (TypeScript) |
| 課金 | Stripe Billing（1円/回、月1,000回まで無料） |
| 対象ユーザー | AIエージェント（Claude, ChatGPT等）、AI SaaS開発者 |

---

## 1. 機能要件

### 1.1 コア機能：暦計算エンジン

以下の暦情報を任意の日付（西暦）に対して正確に算出する。

#### 1.1.1 旧暦変換

- 西暦（グレゴリオ暦）の日付を旧暦（太陰太陽暦）に変換する
- 閏月の判定と処理を正確に行う
- 対応範囲: 1873年1月1日（明治6年、グレゴリオ暦採用）〜 2100年12月31日
- 旧暦の月名（和名）も返す: 睦月、如月、弥生、卯月、皐月、水無月、文月、葉月、長月、神無月、霜月、師走

#### 1.1.2 六曜

- 旧暦の月日から六曜を算出: (旧暦月 + 旧暦日) % 6
- 6種類: 大安、赤口、先勝、友引、先負、仏滅
- 各六曜に読み（ひらがな）、説明文、時間帯別の吉凶を付与

```
大安（たいあん）: 終日吉。万事に良い日
赤口（しゃっこう）: 正午のみ吉。それ以外は凶
先勝（せんしょう）: 午前中が吉、午後は凶
友引（ともびき）: 朝晩は吉、昼は凶。葬儀を避ける
先負（せんぶ）: 午前は凶、午後は吉。控えめに過ごす
仏滅（ぶつめつ）: 終日凶。万事に注意が必要
```

#### 1.1.3 干支（十干十二支）

- 日干支を算出（ユリウス通日から計算）
- 十干: 甲乙丙丁戊己庚辛壬癸
- 十二支: 子丑寅卯辰巳午未申酉戌亥
- 十二支の動物名（日本語・英語）も返す

#### 1.1.4 二十四節気

- 太陽黄経から指定日が属する二十四節気を判定
- 24種類すべてに対応: 立春、雨水、啓蟄、春分、清明、穀雨、立夏、小満、芒種、夏至、小暑、大暑、立秋、処暑、白露、秋分、寒露、霜降、立冬、小雪、大雪、冬至、小寒、大寒
- 各節気に読み、説明、開始日を付与
- 指定日がちょうど節気の当日にあたる場合はフラグで示す

#### 1.1.5 暦注

以下の暦注の判定を行い、該当する場合はリストで返す。

**吉日:**

| 暦注 | 読み | 判定ロジック概要 |
|------|------|--------------|
| 一粒万倍日 | いちりゅうまんばいび | 二十四節気の期間ごとに決まった日干支 |
| 天赦日 | てんしゃにち | 季節×日干支の組み合わせ（年5〜6回） |
| 大明日 | だいみょうにち | 日干支による判定 |
| 母倉日 | ぼそうにち | 月の十二支と日の十二支の組み合わせ |
| 天恩日 | てんおんにち | 干支の組み合わせ（5日連続） |
| 寅の日 | とらのひ | 日干支の十二支が「寅」（12日に1回） |
| 巳の日 | みのひ | 日干支の十二支が「巳」（12日に1回） |
| 己巳の日 | つちのとみのひ | 日干支が「己巳」（60日に1回） |
| 甲子の日 | きのえねのひ | 日干支が「甲子」（60日に1回） |

**凶日:**

| 暦注 | 読み | 判定ロジック概要 |
|------|------|--------------|
| 不成就日 | ふじょうじゅび | 旧暦月ごとの固定パターン |
| 三隣亡 | さんりんぼう | 旧暦月ごとの固定十二支 |
| 受死日 | じゅしにち | 旧暦月ごとの固定十二支 |
| 十死日 | じゅっしにち | 旧暦月ごとの固定十二支 |

各暦注に読み、説明文、吉凶区分（吉/凶）を付与する。

### 1.2 コンテキスト判定機能

六曜と暦注を総合して、用途別の吉凶判定を生成する。

#### 1.2.1 対応カテゴリ（初期8カテゴリ）

```
結婚・結納（wedding）
葬儀・法事（funeral）
引っ越し・転居（moving）
建築着工・上棟（construction）
開業・契約（business）
納車（car_delivery）
入籍（marriage_registration）
旅行出発（travel）
```

#### 1.2.2 判定ルール

- 六曜と暦注の組み合わせで総合判定を算出
- 判定値: 大吉、吉、小吉、問題なし、注意、凶、大凶
- 判定理由を自然言語の日本語で返す（AIがそのままユーザーに伝えられる形）
- 複数の暦注が重なる場合の優先ルール:
  - 天赦日はすべての凶を打ち消す
  - 不成就日は吉日の効果を半減させる（判定を1段階下げる）
  - 一粒万倍日 + 大安 = 大吉に昇格
  - 三隣亡は建築カテゴリのみに影響（他カテゴリには影響しない）

### 1.3 APIエンドポイント

#### EP1: GET /api/v1/calendar/{date}

指定日の暦情報をすべて返す。

**パラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|----------|------|------|------|
| date | string (YYYY-MM-DD) | ✅ | 対象日付 |
| categories | string (カンマ区切り) | - | 吉凶判定するカテゴリ。省略時は全カテゴリ |
| lang | string | - | レスポンス言語。`ja`（デフォルト）または `en` |

**レスポンス:**

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
    },
    "建築着工": {
      "judgment": "吉",
      "note": "大安で着工に適する。一粒万倍日で事業の発展も期待できる",
      "score": 8
    },
    "葬儀": {
      "judgment": "注意",
      "note": "大安は慶事の日のため、葬儀は避けるのが一般的",
      "score": 3
    }
  },
  "summary": "大安と一粒万倍日が重なる大変縁起の良い日です。結婚式・入籍・開業など、新しいことを始めるのに最適です。"
}
```

#### EP2: GET /api/v1/calendar/range

日付範囲の暦情報を一括取得する。

**パラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|----------|------|------|------|
| start | string (YYYY-MM-DD) | ✅ | 開始日 |
| end | string (YYYY-MM-DD) | ✅ | 終了日（最大93日間 = 約3ヶ月） |
| filter_rokuyo | string | - | 六曜でフィルタ（例: `大安`、カンマ区切りで複数可） |
| filter_rekichu | string | - | 暦注でフィルタ（例: `天赦日`、カンマ区切りで複数可） |
| category | string | - | 指定カテゴリの吉日のみ返す（例: `wedding`） |
| min_score | number | - | 指定スコア以上の日のみ返す（1〜10） |

**レスポンス:**

```json
{
  "start": "2026-11-01",
  "end": "2026-11-30",
  "filters_applied": {
    "rokuyo": ["大安"],
    "rekichu": null,
    "category": "wedding",
    "min_score": null
  },
  "count": 5,
  "dates": [
    {
      "date": "2026-11-15",
      "rokuyo": "大安",
      "rekichu": ["一粒万倍日"],
      "context": {
        "結婚": { "judgment": "大吉", "score": 10, "note": "..." }
      }
    }
  ]
}
```

#### EP3: GET /api/v1/calendar/best-days

指定用途に最適な日をランキングで返す。

**パラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|----------|------|------|------|
| purpose | string | ✅ | 用途（wedding/funeral/moving/construction/business/car_delivery/marriage_registration/travel） |
| start | string (YYYY-MM-DD) | ✅ | 検索開始日 |
| end | string (YYYY-MM-DD) | ✅ | 検索終了日（最大365日間） |
| limit | number | - | 返す候補日数（デフォルト5、最大20） |
| exclude_weekdays | string | - | 除外する曜日（例: `月,火`） |

**レスポンス:**

```json
{
  "purpose": "wedding",
  "period": {
    "start": "2026-11-01",
    "end": "2027-03-31"
  },
  "best_days": [
    {
      "rank": 1,
      "date": "2027-01-15",
      "day_of_week": "金曜日",
      "rokuyo": "大安",
      "rekichu": ["天赦日", "一粒万倍日"],
      "judgment": "大吉",
      "score": 10,
      "note": "天赦日と一粒万倍日と大安が重なる年に数回の最強開運日。結婚式に最適"
    },
    {
      "rank": 2,
      "date": "2026-12-20",
      "day_of_week": "日曜日",
      "rokuyo": "大安",
      "rekichu": ["一粒万倍日"],
      "judgment": "大吉",
      "score": 9,
      "note": "大安と一粒万倍日が重なり、週末の日曜日。挙式に好適"
    }
  ]
}
```

#### EP4: GET /health

ヘルスチェック。

```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-04-12T12:00:00Z"
}
```

### 1.4 MCP対応

#### 1.4.1 MCPツール定義

3つのツールをMCPサーバーとして公開する。

**Tool 1: get_japanese_calendar**

```
name: "get_japanese_calendar"
description: |
  日本の暦情報を取得します。指定した日付の六曜（大安・仏滅等）、
  暦注（一粒万倍日・天赦日・不成就日等）、干支、二十四節気を返します。
  さらに、結婚式・引っ越し・建築着工・開業などの用途別に
  その日が吉か凶かの判定とアドバイスも返します。

  使用場面:
  - 「今日は大安？」「明日の六曜は？」
  - 「11月15日に結婚式はどう？」
  - 「来週の一粒万倍日はいつ？」
  - 「今日は何か縁起が良い日？」

  Returns Japanese calendar information including Rokuyo (six-day cycle fortune),
  Rekichu (auspicious/inauspicious day indicators like Ichiryumanbaibi and Tenshanichi),
  Kanshi (sexagenary cycle), and Nijushi Sekki (24 solar terms).
  Also provides context-aware fortune judgments for events like weddings,
  construction starts, business openings, and more.

inputSchema:
  date: string (YYYY-MM-DD) [required]
  categories: string[] [optional] - 吉凶判定カテゴリ
```

**Tool 2: find_best_days**

```
name: "find_best_days"
description: |
  指定した用途（結婚・開業・引っ越し等）に最適な日を
  期間内から探してランキングで返します。
  六曜と暦注を総合的に評価し、最も縁起の良い日から順に返します。

  使用場面:
  - 「来月で結婚式に最適な日はいつ？」
  - 「今年中に開業するなら何日がベスト？」
  - 「4月の大安の一粒万倍日はある？」
  - 「引っ越しに良い日を3つ教えて」

  Finds the best auspicious days for a specific purpose (wedding, business opening,
  moving, etc.) within a date range. Returns ranked results combining Rokuyo and
  Rekichu evaluations.

inputSchema:
  purpose: string [required] - wedding/funeral/moving/construction/business/car_delivery/marriage_registration/travel
  start_date: string (YYYY-MM-DD) [required]
  end_date: string (YYYY-MM-DD) [required]
  limit: number [optional, default: 5]
```

**Tool 3: get_calendar_range**

```
name: "get_calendar_range"
description: |
  日付範囲内の暦情報を一括取得します。
  六曜や暦注でフィルタリングできます。

  使用場面:
  - 「来月の大安を全部教えて」
  - 「今年の天赦日一覧」
  - 「今月の一粒万倍日はいつ？」

  Retrieves calendar information for a date range with optional filtering
  by Rokuyo or Rekichu type.

inputSchema:
  start: string (YYYY-MM-DD) [required]
  end: string (YYYY-MM-DD) [required]
  filter_rokuyo: string [optional]
  filter_rekichu: string [optional]
```

#### 1.4.2 MCP構成

MCPサーバーはREST APIの上に薄いレイヤーとして実装する。

```
AIエージェント
    ↓ MCP (HTTP+SSE)
MCPサーバー（tool handler）
    ↓ 内部HTTP呼び出し
REST API（Hono）
    ↓
暦計算エンジン（コアロジック）
```

MCPサーバーが直接コアロジックを呼ぶのではなく、REST APIを内部的に呼び出す構成にする。これにより課金・認証・ログがREST API側に一元化される。

### 1.5 認証・課金

#### 1.5.1 APIキー認証

- リクエストヘッダー `X-API-Key` でAPIキーを送信
- APIキーの形式: `shrb_` + 32文字のランダム文字列（例: `shrb_a1b2c3d4e5f6...`）
- DBにはSHA-256ハッシュのみ保存
- APIキーのない/無効なリクエストには `401 Unauthorized` を返す
- Freeプランのキーも発行する（月1,000リクエストまで）

#### 1.5.2 レート制限

| プラン | リクエスト/秒 | リクエスト/月 |
|-------|-------------|-------------|
| Free | 1 req/s | 1,000 |
| Starter | 10 req/s | 50,000 |
| Pro | 50 req/s | 500,000 |
| Enterprise | 100 req/s | 無制限 |

レート超過時は `429 Too Many Requests` を返す。レスポンスヘッダーに残リクエスト数を含む:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 2026-05-01T00:00:00Z
```

#### 1.5.3 Stripe連携

- Stripe Billingの従量課金（Metered billing）を使用
- 利用量はアプリケーション側でカウントし、日次バッチでStripeに報告
- 統一単価制:

```
全プラン共通:
  月1,000回まで:  無料
  1,001回以降:    1円/回
```

- プラン間の差別化は月間リクエスト上限とレート制限で行う:
  - Free: 月1,000回 / 1 req/s
  - Starter: 月50,000回 / 10 req/s
  - Pro: 月500,000回 / 50 req/s
  - Enterprise: 無制限 / 100 req/s

---

## 2. 非機能要件

### 2.1 パフォーマンス

- レスポンス時間: p95 < 100ms（単日リクエスト）
- レスポンス時間: p95 < 500ms（範囲リクエスト、93日分）
- コールドスタート: なし（Cloudflare Workers）

### 2.2 可用性

- 目標稼働率: 99.9%（月間ダウンタイム43分以内）
- ヘルスチェック: 1分間隔（BetterStack）

### 2.3 セキュリティ

- HTTPS必須（Cloudflare提供の自動TLS）
- APIキーはハッシュ化してKVに保存
- CORSは制限なし（APIサーバーのため）
- レート制限による abuse 防止

### 2.4 対応範囲・精度

- 日付範囲: 1873-01-01 〜 2100-12-31
- 六曜: 100%正確（旧暦変換が正確なら六曜は自動的に正確）
- 暦注: 国立天文台の暦データと照合して99%以上
- 二十四節気: ±1日以内の精度

---

## 3. システム設計

### 3.1 アーキテクチャ

```
┌──────────────────────────────────────┐
│       Cloudflare Workers             │
│                                      │
│  ┌──────────┐    ┌────────────────┐  │
│  │ Hono     │    │ MCP Server     │  │
│  │ REST API │◄───│ (tool handler) │  │
│  └────┬─────┘    └────────────────┘  │
│       │                              │
│  ┌────▼─────────────────────────┐    │
│  │ Middleware                    │    │
│  │ - API Key Auth (KV lookup)   │    │
│  │ - Rate Limiter (KV counter)  │    │
│  │ - Usage Logger               │    │
│  └────┬─────────────────────────┘    │
│       │                              │
│  ┌────▼─────────────────────────┐    │
│  │ Core Engine                   │    │
│  │ - kyureki.ts (旧暦変換)       │    │
│  │ - rokuyo.ts (六曜)            │    │
│  │ - kanshi.ts (干支)            │    │
│  │ - sekki.ts (二十四節気)       │    │
│  │ - rekichu.ts (暦注)           │    │
│  │ - context.ts (吉凶判定)       │    │
│  └──────────────────────────────┘    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │ Cloudflare KV                 │    │
│  │ - API Keys (hash → plan)     │    │
│  │ - Rate Limit Counters        │    │
│  │ - Usage Logs (daily batch)   │    │
│  └──────────────────────────────┘    │
└──────────────────────────────────────┘

         │ 日次バッチ
         ▼
  ┌──────────────┐
  │ Stripe       │
  │ Usage Report │
  └──────────────┘
```

### 3.2 プロジェクト構成

```
shirabe/
├── src/
│   ├── index.ts                  # Honoエントリポイント + ルーティング
│   ├── routes/
│   │   ├── calendar.ts           # /api/v1/calendar/* エンドポイント
│   │   └── health.ts             # /health エンドポイント
│   ├── core/
│   │   ├── kyureki.ts            # 旧暦変換エンジン
│   │   ├── rokuyo.ts             # 六曜計算
│   │   ├── kanshi.ts             # 干支（十干十二支）計算
│   │   ├── sekki.ts              # 二十四節気計算
│   │   ├── rekichu.ts            # 暦注判定
│   │   ├── context.ts            # 用途別吉凶コンテキスト生成
│   │   ├── calendar-service.ts   # コアエンジンの統合サービス
│   │   └── types.ts              # 型定義
│   ├── data/
│   │   ├── rokuyo-data.ts        # 六曜の定義データ
│   │   ├── rekichu-rules.ts      # 暦注の判定ルールテーブル
│   │   ├── sekki-data.ts         # 二十四節気の定義データ
│   │   ├── context-map.ts        # 暦注×用途の吉凶マッピング
│   │   └── kanshi-data.ts        # 干支の定義データ
│   ├── middleware/
│   │   ├── auth.ts               # APIキー認証
│   │   ├── rate-limit.ts         # レート制限
│   │   └── usage-logger.ts       # 利用量ログ
│   ├── billing/
│   │   └── stripe-reporter.ts    # Stripe利用量報告（日次バッチ）
│   └── mcp/
│       ├── server.ts             # MCPサーバー実装
│       └── tools.ts              # MCPツール定義
├── test/
│   ├── core/
│   │   ├── kyureki.test.ts       # 旧暦変換テスト
│   │   ├── rokuyo.test.ts        # 六曜テスト（100年分）
│   │   ├── kanshi.test.ts        # 干支テスト
│   │   ├── sekki.test.ts         # 二十四節気テスト
│   │   ├── rekichu.test.ts       # 暦注テスト
│   │   └── context.test.ts       # コンテキスト判定テスト
│   ├── routes/
│   │   └── calendar.test.ts      # APIエンドポイントテスト
│   └── fixtures/
│       ├── rokuyo-2020-2030.json # 六曜の正解データ（検証用）
│       └── rekichu-2026.json     # 暦注の正解データ（検証用）
├── scripts/
│   ├── generate-test-data.ts     # テストデータ生成スクリプト
│   └── stripe-daily-report.ts    # Stripe日次利用量報告スクリプト
├── wrangler.toml                 # Cloudflare Workers設定
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### 3.3 技術スタック詳細

| レイヤー | 技術 | バージョン | 理由 |
|---------|------|----------|------|
| ランタイム | Cloudflare Workers | - | エッジ実行、コールドスタートなし、月1,000万リクエスト無料 |
| フレームワーク | Hono | 最新安定版 | 軽量、Cloudflare Workers最適化、OpenAPI自動生成対応 |
| KVストア | Cloudflare KV | - | APIキー、レート制限カウンター、利用量ログ |
| MCP SDK | @modelcontextprotocol/sdk | 最新安定版 | TypeScript公式リファレンス実装 |
| テスト | Vitest | 最新安定版 | 高速、TypeScript対応 |
| 課金 | Stripe SDK | 最新安定版 | 従量課金（1円/回）対応、日本円対応 |
| CI/CD | GitHub Actions | - | テスト→デプロイ自動化 |
| 監視 | BetterStack | 無料プラン | 1分間隔ヘルスチェック |
| ドメイン | Cloudflare DNS | - | shirabe.dev |

### 3.4 データフロー

#### 単日リクエスト（EP1）の処理フロー

```
1. リクエスト受信: GET /api/v1/calendar/2026-11-15?categories=wedding,funeral
2. APIキー認証: X-API-Key → SHA-256ハッシュ → KV検索 → プラン判定
3. レート制限チェック: KVカウンター参照 → 超過なら429返却
4. 日付バリデーション: YYYY-MM-DD形式、範囲内チェック
5. 旧暦変換: kyureki.convert(2026, 11, 15) → {month: 10, day: 1, leap: false}
6. 六曜計算: rokuyo.calc(kyurekiDate) → "大安"
7. 干支計算: kanshi.calc(2026, 11, 15) → "丙辰"
8. 二十四節気: sekki.calc(2026, 11, 15) → "立冬"
9. 暦注判定: rekichu.judge(date, kyureki, kanshi, sekki) → ["一粒万倍日"]
10. コンテキスト生成: context.generate(rokuyo, rekichu, ["wedding","funeral"])
11. サマリー生成: summary.generate(rokuyo, rekichu, context)
12. 利用量カウント: KVカウンター+1
13. レスポンス返却: JSON
```

### 3.5 エラーハンドリング

```json
// 400 Bad Request
{
  "error": {
    "code": "INVALID_DATE",
    "message": "Date must be in YYYY-MM-DD format and between 1873-01-01 and 2100-12-31",
    "details": { "received": "2026-13-01" }
  }
}

// 401 Unauthorized
{
  "error": {
    "code": "INVALID_API_KEY",
    "message": "Invalid or missing API key. Include X-API-Key header."
  }
}

// 429 Too Many Requests
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Retry after 2026-05-01T00:00:00Z",
    "details": {
      "limit": 1000,
      "remaining": 0,
      "reset": "2026-05-01T00:00:00Z"
    }
  }
}

// 500 Internal Server Error
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred. Please try again."
  }
}
```

### 3.6 テスト戦略

#### 単体テスト

| 対象 | テスト内容 | テストケース数 |
|------|----------|-------------|
| kyureki.ts | 旧暦変換の正確性 | 過去100年分の月初・月末・閏月 |
| rokuyo.ts | 六曜の正確性 | 2020〜2030年の全日付（3,652日） |
| kanshi.ts | 干支の正確性 | 60日周期の全パターン + 境界日 |
| sekki.ts | 二十四節気の正確性 | 2020〜2030年の全48節気×11年 |
| rekichu.ts | 暦注判定の正確性 | 各暦注ごとに年間出現日を全検証 |
| context.ts | コンテキスト判定の整合性 | 全カテゴリ×代表的な暦注パターン |

#### 統合テスト

- 各APIエンドポイントのリクエスト/レスポンス検証
- 認証・レート制限の動作検証
- MCP tool handlerの動作検証

#### 検証データのソース

- 六曜: 市販の暦（高島暦等）および暦API（koyomi.zingsystem.com）のデータと照合
- 二十四節気: 国立天文台こよみ計算室のデータ
- 暦注: 暦注計算サイト（koyomi8.com）のデータ

---

## 4. デプロイ・運用

### 4.1 Cloudflare Workers設定

```toml
# wrangler.toml
name = "shirabe-calendar-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
API_VERSION = "1.0.0"

[[kv_namespaces]]
binding = "API_KEYS"
id = "xxx"

[[kv_namespaces]]
binding = "RATE_LIMITS"
id = "xxx"

[[kv_namespaces]]
binding = "USAGE_LOGS"
id = "xxx"
```

### 4.2 CI/CD（GitHub Actions）

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### 4.3 日次バッチ（Stripe利用量報告）

```yaml
# .github/workflows/daily-usage-report.yml
name: Daily Usage Report
on:
  schedule:
    - cron: '0 16 * * *'  # UTC 16:00 = JST 01:00

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx tsx scripts/stripe-daily-report.ts
        env:
          STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### 4.4 監視

- BetterStack: `https://shirabe.dev/health` を1分間隔でチェック
- アラート: Slack通知（ダウン検知から1分以内）
- Cloudflare Analytics: リクエスト数、レスポンス時間、エラー率を確認

---

## 5. 公開・認知戦略

### 5.1 GitHubリポジトリ

- リポジトリ名: `shirabe-calendar-api`
- README.md: 概要、クイックスタート、APIリファレンス、MCP設定例を充実させる
- ライセンス: API自体はプロプライエタリ（MCPサーバーのクライアントコードのみMIT）

### 5.2 MCP公開レジストリ

リリース後に以下のレジストリにPRを送る:

- https://github.com/punkpeye/awesome-mcp-servers
- Glama.ai MCPサーバーディレクトリ
- LobeHub MCPサーバーカタログ

### 5.3 npm パッケージ

- パッケージ名: `@shirabe/calendar-mcp`
- `npx @shirabe/calendar-mcp` で即座にMCPサーバーを起動できるようにする

### 5.4 ドキュメントサイト

- `docs.shirabe.dev`（Cloudflare Pages）
- 初期はREADME.mdで十分。利用者が増えたら独立サイトを構築

---

## 6. 実装の優先順位

Claude Codeに渡す際の実装順序:

### Phase 1: コアエンジン（最優先）

1. `src/core/types.ts` — 型定義
2. `src/core/kyureki.ts` — 旧暦変換エンジン
3. `src/core/rokuyo.ts` — 六曜計算
4. `src/core/kanshi.ts` — 干支計算
5. `src/core/sekki.ts` — 二十四節気計算
6. `src/core/rekichu.ts` — 暦注判定
7. 各コアモジュールの単体テスト

### Phase 2: コンテキスト + API

8. `src/data/context-map.ts` — 吉凶マッピングデータ
9. `src/core/context.ts` — コンテキスト生成ロジック
10. `src/core/calendar-service.ts` — 統合サービス
11. `src/routes/calendar.ts` — REST APIエンドポイント
12. `src/index.ts` — Honoエントリポイント
13. APIエンドポイントの統合テスト

### Phase 3: 認証・課金

14. `src/middleware/auth.ts` — APIキー認証
15. `src/middleware/rate-limit.ts` — レート制限
16. `src/middleware/usage-logger.ts` — 利用量ログ
17. `src/billing/stripe-reporter.ts` — Stripe連携

### Phase 4: MCP

18. `src/mcp/tools.ts` — MCPツール定義
19. `src/mcp/server.ts` — MCPサーバー実装

### Phase 5: デプロイ・公開

20. `wrangler.toml` — Cloudflare Workers設定
21. `.github/workflows/deploy.yml` — CI/CD
22. `README.md` — ドキュメント
23. デプロイ・動作確認
24. MCPレジストリへのPR

---

## 7. 旧暦変換アルゴリズムの実装方針

### 7.1 採用するアルゴリズム

高野英明氏のQREKI.AWKをTypeScriptに移植する。このアルゴリズムは以下の特徴を持つ:

- 天保暦に基づく旧暦計算
- 朔（新月）の計算: ユリウス通日ベース
- 二十四節気の計算: 太陽黄経の近似計算
- 閏月の判定: 中気を含まない月を閏月とする

### 7.2 移植時の注意点

- AWKの浮動小数点精度とTypeScript（JavaScript）のNumber型の精度差に注意
- 角度計算（三角関数）の精度検証
- 閏月の境界ケーステスト（特に2033年問題）

### 7.3 代替アプローチ

QREKIの移植が困難な場合の代替:

- 旧暦の朔日（1日）の日付テーブルを事前計算してハードコードする
- 対応範囲（1873〜2100年）の約2,800ヶ月分のテーブルを生成
- テーブル参照方式なら計算精度の心配が不要

---

*最終更新: 2026年4月12日*
