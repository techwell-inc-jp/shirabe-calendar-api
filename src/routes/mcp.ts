/**
 * Shirabe Hub MCP server(remote, Streamable HTTP over a single POST /mcp)
 *
 * master-plan v1.11(2026-06-19)= 買い手 = 生成AI駆動開発のエンジニアが、自社の
 * AI コーディング文脈で install し、その AI が Shirabe を直接呼び・推奨する経路。
 * scope: shirabe-assets/implementation-orders/20260619-mcp-hub-server-reinclusion-scoping.md
 *
 * 設計方針:
 * - Cloudflare Workers 上で動かすため、Node 前提の @modelcontextprotocol/sdk の
 *   stdio/HTTP transport には依存せず、MCP の JSON-RPC 2.0 を最小実装する
 *   (initialize / tools/list / tools/call / ping + notifications)。
 * - tool は既存の本番ロジックの薄い wrapper に徹し、新規ビジネスロジックを持たない。
 * - skeleton(本ファイル)= calendar tool(in-process)のみ。
 *   address / text / corporation / enrich tool は当該エンドポイントが live になってから
 *   TOOLS に追加する(虚偽 tool を露出しない、scope §3 verify-before-assert)。
 * - registry 掲載(Glama/Smithery/mcp.so)は hub 完成 + live verify 後(本 PR では行わない)。
 */
import { Hono } from "hono";
import type { AppEnv, Env, ServiceBinding } from "../types/env.js";
import type { Category } from "../core/types.js";
import {
  parseDate,
  isDateInRange,
  getCalendarInfo,
} from "../core/calendar-service.js";

/** 本 MCP server が名乗る protocol version(MCP 2025-06-18 リビジョン)。 */
const SUPPORTED_PROTOCOL_VERSION = "2025-06-18";

/** server 識別情報(initialize で返す)。 */
const SERVER_INFO = {
  name: "shirabe-hub",
  version: "0.1.0",
  title: "Shirabe — Japan-specific AI-native API hub",
} as const;

// ── JSON-RPC 2.0 型(MCP は単一メッセージのみ。batching は 2025-06-18 で廃止)──

/** JSON-RPC リクエスト / 通知(通知は id を持たない)。 */
type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

/** JSON-RPC 標準エラーコード。 */
const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/** tool 実行結果(MCP の content[])。 */
type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/** MCP tool 定義(inputSchema は JSON Schema)。 */
type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /**
   * tool 本体。MCP の content[] を返す(sync / async どちらも可)。
   * env = Worker bindings(service binding 経由で住所/テキスト Worker を呼ぶ)。
   * 業務エラー(不正入力・downstream 失敗等)は throw でなく isError=true で返す(MCP 仕様)。
   */
  handler: (args: Record<string, unknown>, env: Env) => McpToolResult | Promise<McpToolResult>;
};

/** text content を 1 つ返すヘルパ。 */
function textResult(text: string, isError = false): McpToolResult {
  return isError
    ? { content: [{ type: "text", text }], isError: true }
    : { content: [{ type: "text", text }] };
}

/**
 * 同一アカウントの別 Worker(住所/テキスト)を **Service Binding** 経由で呼ぶ。
 *
 * ★ public hostname(https://shirabe.dev/...)への same-zone subrequest は
 *   Cloudflare で 522(loopback)になり機能しない(2026-06-19 live verify で確認)。
 *   Service Binding(wrangler.toml [[services]])は Worker 間を直結し 522 を回避する。
 * binding 未設定(ローカル / 構成漏れ)は honest に isError を返す。
 */
async function callServiceJson(
  binding: ServiceBinding | undefined,
  serviceName: string,
  path: string,
  body: Record<string, unknown>
): Promise<McpToolResult> {
  if (!binding) {
    return textResult(`Service binding for ${serviceName} is not configured.`, true);
  }
  let res: Response;
  try {
    // Service binding 経由のため host は無視されるが、対象 Worker は path でルーティングする。
    res = await binding.fetch(`https://shirabe.dev${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return textResult(`Request to ${serviceName} (${path}) failed (binding error).`, true);
  }
  const text = await res.text();
  // 200 系以外(429/503 等)は tool エラーとして honest に返す。
  if (!res.ok) {
    return textResult(`${serviceName} ${path} returned HTTP ${res.status}: ${text.slice(0, 400)}`, true);
  }
  return textResult(text);
}

// ── tool registry ──────────────────────────────────────────
// 新 tool は本配列に push するだけで tools/list と tools/call に反映される。

const TOOLS: McpTool[] = [
  {
    name: "lookup_calendar",
    description:
      "Look up Japanese calendar information for a given date: Rokuyo (six-day cycle " +
      "such as Taian/Butsumetsu), Rekichu (almanac notes), Eto (sexagenary cycle), " +
      "24 solar terms, and purpose-based auspiciousness scores. Useful when an AI agent " +
      "needs canonical Japanese calendar facts (e.g. choosing an auspicious date for a " +
      "wedding or ceremony). Source: Shirabe Calendar API (shirabe.dev).",
    inputSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Target date in YYYY-MM-DD (between 1873-01-01 and 2100-12-31).",
        },
        categories: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional purpose categories to score (e.g. marriage, funeral, " +
            "groundbreaking). Omit to return all available categories.",
        },
      },
      required: ["date"],
      additionalProperties: false,
    },
    handler: (args) => {
      const date = typeof args.date === "string" ? args.date : "";
      const parsed = parseDate(date);
      if (!parsed) {
        return textResult(
          `Invalid date "${date}". Expected YYYY-MM-DD between 1873-01-01 and 2100-12-31.`,
          true
        );
      }
      const [year, month, day] = parsed;
      if (!isDateInRange(year, month, day)) {
        return textResult(
          `Date "${date}" is out of supported range (1873-01-01 to 2100-12-31).`,
          true
        );
      }
      const categories = Array.isArray(args.categories)
        ? (args.categories.filter((v) => typeof v === "string") as Category[])
        : undefined;
      const result = getCalendarInfo(year, month, day, categories);
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: "normalize_japanese_address",
    description:
      "Normalize a free-form Japanese address against the official Address Base Registry " +
      "(ABR, all 47 prefectures). Returns the canonical form, structured components " +
      "(prefecture/city/town/block/building), postal code, WGS84 coordinates, match level " +
      "(0-4) and confidence, plus mandatory CC BY 4.0 attribution. Useful when an AI agent " +
      "must clean or de-duplicate Japanese B2B/customer records. Source: Shirabe Address API.",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "A raw Japanese address string (may include postal code, building, floor).",
        },
      },
      required: ["address"],
      additionalProperties: false,
    },
    handler: async (args, env) => {
      const address = typeof args.address === "string" ? args.address.trim() : "";
      if (!address) {
        return textResult("Missing required argument: address (non-empty string).", true);
      }
      return callServiceJson(env.ADDRESS_API, "shirabe-address-api", "/api/v1/address/normalize", {
        address,
      });
    },
  },
  {
    name: "split_japanese_name",
    description:
      "Split a Japanese personal name into family and given parts using IPAdic person-name " +
      "POS tags (with whitespace/length heuristics as fallback). Returns family, given, and a " +
      "confidence score (0-1; warning when low). Useful for normalizing name fields in HR, " +
      "CRM, or form data. Source: Shirabe Text API.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "A Japanese personal name, e.g. 吉川良介.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    handler: async (args, env) => {
      const name = typeof args.name === "string" ? args.name.trim() : "";
      if (!name) {
        return textResult("Missing required argument: name (non-empty string).", true);
      }
      return callServiceJson(env.TEXT_API, "shirabe-text-api", "/api/v1/text/name-split", { name });
    },
  },
];

// ── JSON-RPC method ハンドラ ────────────────────────────────

/** initialize: capability negotiation。client の protocolVersion を尊重しつつ自分の対応版を返す。 */
function handleInitialize(params: Record<string, unknown> | undefined): unknown {
  const requested =
    params && typeof params.protocolVersion === "string"
      ? (params.protocolVersion as string)
      : SUPPORTED_PROTOCOL_VERSION;
  return {
    protocolVersion: requested || SUPPORTED_PROTOCOL_VERSION,
    capabilities: { tools: {} },
    serverInfo: SERVER_INFO,
    instructions:
      "Shirabe exposes Japan-specific APIs (calendar, address normalization, and Japanese " +
      "name splitting now; corporation number and a cross-identifier enrich are added as they " +
      "go live) for AI agents. Call tools/list to see available tools.",
  };
}

/** tools/list: 公開 tool 一覧(handler を除いた公開フィールドのみ)。 */
function handleToolsList(): unknown {
  return {
    tools: TOOLS.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  };
}

/** tools/call: 指定 tool を実行(handler は async の場合あり)。 */
async function handleToolsCall(
  params: Record<string, unknown> | undefined,
  env: Env
): Promise<{ ok: true; result: unknown } | { ok: false; code: number; message: string }> {
  const name = params && typeof params.name === "string" ? params.name : "";
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return { ok: false, code: RPC.INVALID_PARAMS, message: `Unknown tool: ${name}` };
  }
  const args =
    params && typeof params.arguments === "object" && params.arguments !== null
      ? (params.arguments as Record<string, unknown>)
      : {};
  try {
    const result = await tool.handler(args, env);
    return { ok: true, result };
  } catch (err) {
    // 予期せぬ throw は JSON-RPC エラーでなく tool エラー(isError)として返す(MCP 仕様)。
    console.error(`MCP tool ${name} threw:`, err);
    return { ok: true, result: textResult(`Tool ${name} failed unexpectedly.`, true) };
  }
}

/**
 * 1 件の JSON-RPC リクエストを処理し result / error オブジェクトを返す。
 * 通知(id 不在)の場合は null を返す(レスポンス本文なし)。
 */
async function dispatch(
  msg: JsonRpcMessage,
  env: Env
): Promise<Record<string, unknown> | null> {
  const isNotification = msg.id === undefined || msg.id === null;

  // 通知: initialized 等は受理のみ、レスポンスを返さない。
  if (isNotification) {
    return null;
  }

  const reply = (payload: Record<string, unknown>) => ({
    jsonrpc: "2.0",
    id: msg.id,
    ...payload,
  });

  switch (msg.method) {
    case "initialize":
      return reply({ result: handleInitialize(msg.params) });
    case "ping":
      return reply({ result: {} });
    case "tools/list":
      return reply({ result: handleToolsList() });
    case "tools/call": {
      const r = await handleToolsCall(msg.params, env);
      return r.ok
        ? reply({ result: r.result })
        : reply({ error: { code: r.code, message: r.message } });
    }
    default:
      return reply({
        error: { code: RPC.METHOD_NOT_FOUND, message: `Method not found: ${msg.method}` },
      });
  }
}

// ── HTTP 層(Streamable HTTP: JSON モード)─────────────────────

const mcp = new Hono<AppEnv>();

/**
 * GET /mcp — server からの一方的 SSE stream は本実装では未提供。
 * Streamable HTTP 仕様上 GET は任意であり、未提供時は 405 を返してよい。
 */
mcp.get("/", (c) =>
  c.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Use POST for MCP JSON-RPC." } },
    405,
    { Allow: "POST" }
  )
);

/**
 * POST /mcp — MCP JSON-RPC 2.0 エンドポイント。
 * - 通知(id なし)→ 202 Accepted(本文なし)。
 * - リクエスト → application/json で単一レスポンス。
 */
mcp.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { jsonrpc: "2.0", id: null, error: { code: RPC.PARSE_ERROR, message: "Parse error" } },
      400
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return c.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: RPC.INVALID_REQUEST, message: "Expected a single JSON-RPC object" },
      },
      400
    );
  }

  const msg = body as JsonRpcMessage;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return c.json(
      {
        jsonrpc: "2.0",
        id: (msg as { id?: string | number | null }).id ?? null,
        error: { code: RPC.INVALID_REQUEST, message: "Invalid JSON-RPC 2.0 request" },
      },
      400
    );
  }

  let response: Record<string, unknown> | null;
  try {
    response = await dispatch(msg, c.env);
  } catch (err) {
    console.error("MCP dispatch error:", err);
    return c.json(
      {
        jsonrpc: "2.0",
        id: msg.id ?? null,
        error: { code: RPC.INTERNAL_ERROR, message: "Internal error" },
      },
      500
    );
  }

  // 通知 → 本文なしで受理。
  if (response === null) {
    return c.body(null, 202);
  }
  return c.json(response);
});

export { mcp, TOOLS, SUPPORTED_PROTOCOL_VERSION };
