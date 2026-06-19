/**
 * Hub MCP server(/mcp、Streamable HTTP JSON モード)テスト
 *
 * master-plan v1.11(2026-06-19)= buyer-discovery 経路としての MCP 再導入。
 * scope: shirabe-assets/implementation-orders/20260619-mcp-hub-server-reinclusion-scoping.md
 *
 * 検証:
 * - JSON-RPC: initialize / tools/list / tools/call / ping / 通知 / 不正系
 * - skeleton tool = lookup_calendar(in-process、暦 core の薄い wrapper)
 * - /api/* ミドルウェア対象外(認証なしで匿名呼出可)
 */
import { describe, it, expect } from "vitest";
import app from "../../src/index.js";
import { createMockEnv } from "../helpers/mock-kv.js";

/** /mcp に JSON-RPC を POST するヘルパ。 */
async function rpc(payload: unknown) {
  const env = createMockEnv();
  const res = await app.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(payload),
    }),
    env
  );
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, text, json: json as Record<string, unknown> | null };
}

describe("MCP initialize", () => {
  it("protocolVersion / capabilities.tools / serverInfo を返す", async () => {
    const { res, json } = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
    });
    expect(res.status).toBe(200);
    expect(json?.jsonrpc).toBe("2.0");
    expect(json?.id).toBe(1);
    const result = json?.result as Record<string, unknown>;
    expect(result.protocolVersion).toBe("2025-06-18");
    expect(result.capabilities).toHaveProperty("tools");
    expect((result.serverInfo as Record<string, unknown>).name).toBe("shirabe-hub");
  });
});

describe("MCP tools/list", () => {
  it("lookup_calendar を inputSchema 付きで返す", async () => {
    const { res, json } = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(res.status).toBe(200);
    const tools = (json?.result as { tools: Array<Record<string, unknown>> }).tools;
    const cal = tools.find((t) => t.name === "lookup_calendar");
    expect(cal).toBeDefined();
    expect(cal?.description).toBeTruthy();
    expect((cal?.inputSchema as Record<string, unknown>).type).toBe("object");
    // handler はワイヤ上に露出しない。
    expect(cal).not.toHaveProperty("handler");
  });
});

describe("MCP tools/call lookup_calendar", () => {
  it("正常: 暦情報 JSON を text content で返す", async () => {
    const { res, json } = await rpc({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "lookup_calendar", arguments: { date: "2026-06-19" } },
    });
    expect(res.status).toBe(200);
    const result = json?.result as { content: Array<{ type: string; text: string }>; isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(typeof parsed).toBe("object");
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
  });

  it("不正日付: isError=true(JSON-RPC エラーでなく tool エラー)", async () => {
    const { res, json } = await rpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "lookup_calendar", arguments: { date: "not-a-date" } },
    });
    expect(res.status).toBe(200);
    const result = json?.result as { content: Array<{ text: string }>; isError?: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid date");
  });

  it("未知 tool: INVALID_PARAMS(-32602)", async () => {
    const { json } = await rpc({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "no_such_tool", arguments: {} },
    });
    expect((json?.error as Record<string, unknown>).code).toBe(-32602);
  });
});

describe("MCP ping / 通知 / 不正系", () => {
  it("ping は空 result を返す", async () => {
    const { json } = await rpc({ jsonrpc: "2.0", id: 6, method: "ping" });
    expect(json?.result).toEqual({});
  });

  it("通知(id なし)は 202 + 本文なし", async () => {
    const { res, text } = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
    expect(text).toBe("");
  });

  it("未知 method は METHOD_NOT_FOUND(-32601)", async () => {
    const { json } = await rpc({ jsonrpc: "2.0", id: 7, method: "resources/list" });
    expect((json?.error as Record<string, unknown>).code).toBe(-32601);
  });

  it("不正 JSON は PARSE_ERROR(-32700)", async () => {
    const env = createMockEnv();
    const res = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ not json",
      }),
      env
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect((json.error as Record<string, unknown>).code).toBe(-32700);
  });

  it("jsonrpc バージョン欠落は INVALID_REQUEST(-32600)", async () => {
    const { res, json } = await rpc({ id: 8, method: "tools/list" });
    expect(res.status).toBe(400);
    expect((json?.error as Record<string, unknown>).code).toBe(-32600);
  });

  it("GET /mcp は 405", async () => {
    const env = createMockEnv();
    const res = await app.fetch(new Request("http://localhost/mcp"), env);
    expect(res.status).toBe(405);
  });
});
