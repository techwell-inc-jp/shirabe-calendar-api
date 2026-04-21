/**
 * S1 計測基盤: 分類ロジック(純粋関数)
 *
 * プロジェクト基準ドキュメント v1.02 第8章・付録C に完全準拠。
 * - AIクローラーUA一覧による分類(ai/human/bot)
 * - AI検索Referrer一覧による分類(ai_search/other)
 * - エンドポイントの種別判定(api_call/openapi_view/docs_view/health/webhook/checkout/internal/other)
 * - パスの正規化(日付・IDのカーディナリティ抑制)
 * - Tool Hintの推定(gpts/langchain/dify/llamaindex/none)
 * - Content Platform分類(qiita/zenn/github/devto/medium/note/other/none)
 *   ← 2026-04-22 追加: B-2 仮説(Qiita 記事経由流入)等の観測のため、
 *     AI検索以外の Referrer を技術コミュニティサイト別に識別する
 *
 * すべて副作用なしの純粋関数として実装し、ユニットテストで網羅する。
 */

// ---------------------------------------------------------------------------
// AIクローラーUA一覧(基準ドキュメント付録C・第8章)
// ---------------------------------------------------------------------------

/**
 * AIクローラー判定用UAパターン。
 * 値のキーは AI vendor の分類子として使用する。
 */
const AI_CRAWLER_VENDORS: ReadonlyArray<{ ua: string; vendor: AIVendor }> = [
  { ua: "ChatGPT-User", vendor: "openai" },
  { ua: "GPTBot", vendor: "openai" },
  { ua: "Claude-Web", vendor: "anthropic" },
  { ua: "ClaudeBot", vendor: "anthropic" },
  { ua: "anthropic-ai", vendor: "anthropic" },
  { ua: "PerplexityBot", vendor: "perplexity" },
  { ua: "Google-Extended", vendor: "google" },
  { ua: "Bytespider", vendor: "bytedance" },
  { ua: "cohere-ai", vendor: "cohere" },
  { ua: "FacebookBot", vendor: "meta" },
  { ua: "Diffbot", vendor: "diffbot" },
  { ua: "Applebot-Extended", vendor: "apple" },
];

export type UACategory = "ai" | "human" | "bot";

export type AIVendor =
  | "openai"
  | "anthropic"
  | "perplexity"
  | "google"
  | "bytedance"
  | "cohere"
  | "meta"
  | "diffbot"
  | "apple"
  | "none";

/**
 * User-Agent文字列から、AI/人間/汎用bot のいずれかに分類する。
 *
 * 判定優先順位: AIクローラー > 汎用bot判定 > human。
 * null・空文字は human 扱い(bot/AI示唆情報がないため)。
 */
export function categorizeUserAgent(ua: string | null | undefined): UACategory {
  if (!ua) return "human";
  if (matchesAICrawler(ua)) return "ai";
  // AIクローラー判定を通過してから汎用bot判定する。
  // `bot/crawler/spider` を含むが上記一覧に無いもの(Googlebot等)は "bot"。
  if (/bot|crawler|spider/i.test(ua)) return "bot";
  return "human";
}

/**
 * User-Agent文字列から AI vendor を特定する。
 * AIクローラーに該当しない場合は "none"。
 */
export function detectAIVendor(ua: string | null | undefined): AIVendor {
  if (!ua) return "none";
  for (const entry of AI_CRAWLER_VENDORS) {
    if (ua.includes(entry.ua)) return entry.vendor;
  }
  return "none";
}

function matchesAICrawler(ua: string): boolean {
  return AI_CRAWLER_VENDORS.some((entry) => ua.includes(entry.ua));
}

// ---------------------------------------------------------------------------
// AI検索 Referrer 一覧(基準ドキュメント付録C・第8章)
// ---------------------------------------------------------------------------

const AI_SEARCH_REFERRERS: ReadonlyArray<{ domain: string; vendor: ReferrerVendor }> = [
  { domain: "perplexity.ai", vendor: "perplexity" },
  { domain: "felo.ai", vendor: "felo" },
  { domain: "you.com", vendor: "you" },
  { domain: "phind.com", vendor: "phind" },
  { domain: "chat.openai.com", vendor: "chatgpt" },
  { domain: "chatgpt.com", vendor: "chatgpt" },
  { domain: "claude.ai", vendor: "claude" },
  { domain: "gemini.google.com", vendor: "gemini" },
  { domain: "copilot.microsoft.com", vendor: "copilot" },
];

export type ReferrerType = "ai_search" | "other";

export type ReferrerVendor =
  | "perplexity"
  | "felo"
  | "you"
  | "phind"
  | "chatgpt"
  | "claude"
  | "gemini"
  | "copilot"
  | "none";

/**
 * ReferrerヘッダーからAI検索由来か否かを判定する。
 *
 * 不正URL・null・空文字は "other"。
 */
export function categorizeReferrer(referrer: string | null | undefined): ReferrerType {
  return detectReferrerVendor(referrer) === "none" ? "other" : "ai_search";
}

/**
 * Referrerから AI検索エンジンの vendor を特定する。
 * 該当なし・不正URLは "none"。
 */
export function detectReferrerVendor(referrer: string | null | undefined): ReferrerVendor {
  if (!referrer) return "none";
  let host: string;
  try {
    host = new URL(referrer).hostname;
  } catch {
    return "none";
  }
  for (const entry of AI_SEARCH_REFERRERS) {
    if (host === entry.domain || host.endsWith(`.${entry.domain}`) || host.includes(entry.domain)) {
      return entry.vendor;
    }
  }
  return "none";
}

// ---------------------------------------------------------------------------
// エンドポイント種別
// ---------------------------------------------------------------------------

export type EndpointKind =
  | "api_call"
  | "openapi_view"
  | "docs_view"
  | "health"
  | "webhook"
  | "checkout"
  | "internal"
  | "mcp"
  | "other";

/**
 * 正規化後のpathname からエンドポイント種別を判定する。
 *
 * indexes カラムに使用するためカーディナリティが低い値のみを返す。
 */
export function categorizeEndpoint(normalizedPath: string): EndpointKind {
  if (normalizedPath === "/openapi.yaml" || normalizedPath === "/openapi.json") {
    return "openapi_view";
  }
  if (normalizedPath === "/health") return "health";
  if (normalizedPath.startsWith("/webhook/")) return "webhook";
  if (normalizedPath.startsWith("/checkout/")) return "checkout";
  if (normalizedPath === "/api/v1/checkout" || normalizedPath.startsWith("/api/v1/checkout/")) {
    return "checkout";
  }
  if (normalizedPath.startsWith("/internal/")) return "internal";
  if (normalizedPath === "/mcp" || normalizedPath.startsWith("/mcp/")) return "mcp";
  if (normalizedPath.startsWith("/api/")) return "api_call";
  // 静的ページ群(/、/terms、/privacy、/legal、/upgrade)は docs_view 扱い
  if (
    normalizedPath === "/" ||
    normalizedPath === "/terms" ||
    normalizedPath === "/privacy" ||
    normalizedPath === "/legal" ||
    normalizedPath === "/upgrade"
  ) {
    return "docs_view";
  }
  // B-1 AI検索向けSEOページ群 + AIクローラーメタデータ
  // (/docs/*、/robots.txt、/sitemap.xml、/llms.txt)
  if (normalizedPath.startsWith("/docs/")) return "docs_view";
  if (
    normalizedPath === "/robots.txt" ||
    normalizedPath === "/sitemap.xml" ||
    normalizedPath === "/llms.txt"
  ) {
    return "docs_view";
  }
  return "other";
}

// ---------------------------------------------------------------------------
// パス正規化(カーディナリティ抑制)
// ---------------------------------------------------------------------------

/** ISO日付(YYYY-MM-DD)パターン */
const DATE_SEGMENT = /^\d{4}-\d{2}-\d{2}$/;

/** 32文字以上の16進数(APIキー/セッションID等) */
const HEX_ID_SEGMENT = /^[0-9a-fA-F]{32,}$/;

/** Stripe 系の ID (cs_live_、cs_test_、sub_、cus_、price_ 等) */
const STRIPE_ID_SEGMENT = /^(cs|sub|cus|price|prod|in|ch|pi|si|mtr|evt)_[A-Za-z0-9_]+$/;

/** 純粋な数値ID */
const NUMERIC_SEGMENT = /^\d+$/;

/** UUID */
const UUID_SEGMENT =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * パスを正規化してカーディナリティを抑える。
 *
 * - 日付セグメント(YYYY-MM-DD)は `:date` に置換
 * - 32文字以上の16進IDは `:id` に置換
 * - Stripe系IDは `:id` に置換
 * - UUIDは `:id` に置換
 * - 純粋な数値IDは `:id` に置換
 * - 末尾スラッシュは除去(ルート"/"は保持)
 * - クエリ・フラグメントは事前に除外済みである前提
 */
export function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  // クエリやフラグメントが混入していても安全に切り落とす
  const clean = pathname.split("?")[0].split("#")[0];
  const segments = clean.split("/");
  const normalized = segments.map((seg) => {
    if (!seg) return seg; // 空文字(先頭・連続スラッシュ由来)はそのまま
    if (DATE_SEGMENT.test(seg)) return ":date";
    if (UUID_SEGMENT.test(seg)) return ":id";
    if (HEX_ID_SEGMENT.test(seg)) return ":id";
    if (STRIPE_ID_SEGMENT.test(seg)) return ":id";
    if (NUMERIC_SEGMENT.test(seg)) return ":id";
    return seg;
  });
  let result = normalized.join("/");
  // 末尾スラッシュ除去("/" は例外)
  if (result.length > 1 && result.endsWith("/")) result = result.slice(0, -1);
  return result || "/";
}

// ---------------------------------------------------------------------------
// Tool Hint 検出(GPTs/LangChain/Dify/LlamaIndex)
// ---------------------------------------------------------------------------

export type ToolHint = "gpts" | "langchain" | "dify" | "llamaindex" | "none";

/**
 * リクエストヘッダーから利用元ツールを推定する。
 *
 * 仕様が未確定の領域のため暫定実装。将来的な拡張を前提に、
 * User-Agent / X-Source / X-Client の3系統を優先順で評価する。
 *
 * 優先順:
 * 1. 明示ヘッダー(X-Source / X-Client)
 * 2. User-Agent 文字列の特徴的トークン
 *
 * どれにもヒットしなければ "none"。
 */
export function detectToolHint(headers: {
  userAgent?: string | null;
  xSource?: string | null;
  xClient?: string | null;
}): ToolHint {
  // 明示ヘッダー優先
  const explicit = normalizeTokenToHint(headers.xSource) ?? normalizeTokenToHint(headers.xClient);
  if (explicit) return explicit;

  const ua = (headers.userAgent || "").toLowerCase();
  if (!ua) return "none";

  // GPTs Actions は openai-*/actions 系の UA を返すことが多い
  if (ua.includes("openai") && (ua.includes("gpt") || ua.includes("action"))) return "gpts";
  if (ua.includes("chatgpt-user")) return "gpts";

  if (ua.includes("langchain")) return "langchain";
  if (ua.includes("llamaindex") || ua.includes("llama-index") || ua.includes("llama_index"))
    return "llamaindex";
  if (ua.includes("dify")) return "dify";
  return "none";
}

function normalizeTokenToHint(token: string | null | undefined): ToolHint | null {
  if (!token) return null;
  const t = token.toLowerCase().trim();
  if (t === "gpts" || t === "chatgpt-gpts" || t === "chatgpt-actions") return "gpts";
  if (t === "langchain") return "langchain";
  if (t === "llamaindex" || t === "llama-index") return "llamaindex";
  if (t === "dify") return "dify";
  return null;
}

// ---------------------------------------------------------------------------
// Content Platform 検出(Qiita/Zenn/GitHub/Dev.to/Medium/note)
//
// 4/22 AE サニティチェックで、Referrer が AI 検索(blob3/blob4)以外は全て
// "other"/"none" に縮退していることが判明。B-2 仮説(Qiita 記事経由流入)の
// 観測には技術コミュニティサイトの識別が必要なため、別 blob として追加。
//
// 設計方針:
// - detectReferrerVendor と独立した分類(AI search は ai_search 側で判定済み)
// - ホスト名完全一致 or サブドメインで判定(qiita.com / www.qiita.com など)
// - 拡張性のため CONTENT_PLATFORMS 配列ベース
// ---------------------------------------------------------------------------

/**
 * 技術コミュニティサイトからの Referrer 分類。
 *
 * - `qiita`: qiita.com 系
 * - `zenn`: zenn.dev
 * - `github`: github.com / *.github.io / *.githubusercontent.com
 * - `devto`: dev.to
 * - `medium`: medium.com / *.medium.com
 * - `note`: note.com(note 株式会社)
 * - `other`: Referrer は存在するが上記どれにも該当しない
 * - `none`: Referrer ヘッダーが無い、もしくは URL として不正
 */
export type ContentPlatform =
  | "qiita"
  | "zenn"
  | "github"
  | "devto"
  | "medium"
  | "note"
  | "other"
  | "none";

const CONTENT_PLATFORMS: ReadonlyArray<{ domain: string; platform: ContentPlatform }> = [
  { domain: "qiita.com", platform: "qiita" },
  { domain: "zenn.dev", platform: "zenn" },
  { domain: "github.com", platform: "github" },
  { domain: "github.io", platform: "github" },
  { domain: "githubusercontent.com", platform: "github" },
  { domain: "dev.to", platform: "devto" },
  { domain: "medium.com", platform: "medium" },
  { domain: "note.com", platform: "note" },
];

/**
 * Referrer ヘッダーから技術コミュニティサイトのプラットフォームを特定する。
 *
 * - Referrer が存在しない / URL parse に失敗した場合は `none`
 * - ホスト名が CONTENT_PLATFORMS のいずれかのドメインと一致(または `.domain`
 *   で終わる)なら対応する platform
 * - どのパターンにも一致しなければ `other`(外部 Referrer あり、ただし非対象)
 *
 * 既存の detectReferrerVendor(AI search 分類)とは独立。AI 検索かつ技術
 * プラットフォームに重複したケースは実在しないため、両者を並列に記録する。
 */
export function detectContentPlatform(referrer: string | null | undefined): ContentPlatform {
  if (!referrer) return "none";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "none";
  }
  if (!host) return "none";
  for (const entry of CONTENT_PLATFORMS) {
    if (host === entry.domain || host.endsWith(`.${entry.domain}`)) {
      return entry.platform;
    }
  }
  return "other";
}
