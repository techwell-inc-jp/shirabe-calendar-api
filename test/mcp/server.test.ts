/**
 * MCPサーバーのテスト
 *
 * InMemoryTransportを使ってMCPサーバーとクライアントを接続し、
 * ツールの一覧取得とツール呼び出しをテストする。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/mcp/server.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** ツール呼び出し結果からJSONをパースするヘルパー */
function parseToolResult(result: Awaited<ReturnType<Client["callTool"]>>): any {
  const content = (result as any).content[0];
  return JSON.parse(content.text);
}

describe("MCPサーバー", () => {
  let client: Client;
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    const mcpServer = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "1.0.0" });

    await mcpServer.connect(serverTransport);
    await client.connect(clientTransport);

    closeServer = async () => {
      await client.close();
      await mcpServer.close();
    };
  });

  afterAll(async () => {
    await closeServer();
  });

  describe("list_tools", () => {
    it("3つのツールを返す", async () => {
      const result = await client.listTools();
      expect(result.tools).toHaveLength(3);
    });

    it("get_japanese_calendarツールが含まれる", async () => {
      const result = await client.listTools();
      const tool = result.tools.find((t) => t.name === "get_japanese_calendar");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("六曜");
      expect(tool!.description).toContain("Rokuyo");
    });

    it("find_best_daysツールが含まれる", async () => {
      const result = await client.listTools();
      const tool = result.tools.find((t) => t.name === "find_best_days");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("最適な日");
      expect(tool!.description).toContain("best auspicious days");
    });

    it("get_calendar_rangeツールが含まれる", async () => {
      const result = await client.listTools();
      const tool = result.tools.find((t) => t.name === "get_calendar_range");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("一括取得");
      expect(tool!.description).toContain("Retrieves calendar information");
    });

    it("各ツールにinputSchemaが定義されている", async () => {
      const result = await client.listTools();
      for (const tool of result.tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
      }
    });
  });

  describe("call_tool: get_japanese_calendar", () => {
    it("正しい日付で暦情報を返す", async () => {
      const result = await client.callTool({
        name: "get_japanese_calendar",
        arguments: { date: "2026-04-12" },
      });

      const content = (result as any).content;
      expect(content).toHaveLength(1);
      expect(content[0]).toHaveProperty("type", "text");

      const data = parseToolResult(result);
      expect(data.date).toBe("2026-04-12");
      expect(data.rokuyo).toBeDefined();
      expect(data.kanshi).toBeDefined();
      expect(data.rekichu).toBeDefined();
      expect(data.context).toBeDefined();
      expect(data.summary).toBeDefined();
    });

    it("カテゴリ指定で暦情報を返す", async () => {
      const result = await client.callTool({
        name: "get_japanese_calendar",
        arguments: { date: "2026-04-12", categories: ["wedding", "business"] },
      });

      const data = parseToolResult(result);
      const contextKeys = Object.keys(data.context);
      expect(contextKeys).toHaveLength(2);
    });

    it("不正な日付でエラーを返す", async () => {
      const result = await client.callTool({
        name: "get_japanese_calendar",
        arguments: { date: "invalid" },
      });

      expect(result.isError).toBe(true);
      const data = parseToolResult(result);
      expect(data.error.code).toBe("INVALID_DATE");
    });

    it("範囲外の日付でエラーを返す", async () => {
      const result = await client.callTool({
        name: "get_japanese_calendar",
        arguments: { date: "1800-01-01" },
      });

      expect(result.isError).toBe(true);
      const data = parseToolResult(result);
      expect(data.error.code).toBe("DATE_OUT_OF_RANGE");
    });
  });

  describe("call_tool: find_best_days", () => {
    it("指定期間のベスト日を返す", async () => {
      const result = await client.callTool({
        name: "find_best_days",
        arguments: {
          purpose: "wedding",
          start_date: "2026-04-01",
          end_date: "2026-04-30",
        },
      });

      const data = parseToolResult(result);
      expect(data.purpose).toBe("wedding");
      expect(data.best_days.length).toBeGreaterThan(0);
      expect(data.best_days.length).toBeLessThanOrEqual(5);
    });

    it("limit指定が動作する", async () => {
      const result = await client.callTool({
        name: "find_best_days",
        arguments: {
          purpose: "business",
          start_date: "2026-04-01",
          end_date: "2026-04-30",
          limit: 3,
        },
      });

      const data = parseToolResult(result);
      expect(data.best_days.length).toBeLessThanOrEqual(3);
    });

    it("不正な日付でエラーを返す", async () => {
      const result = await client.callTool({
        name: "find_best_days",
        arguments: {
          purpose: "wedding",
          start_date: "invalid",
          end_date: "2026-04-30",
        },
      });

      expect(result.isError).toBe(true);
      const data = parseToolResult(result);
      expect(data.error.code).toBe("INVALID_DATE");
    });

    it("end < startでエラーを返す", async () => {
      const result = await client.callTool({
        name: "find_best_days",
        arguments: {
          purpose: "wedding",
          start_date: "2026-04-30",
          end_date: "2026-04-01",
        },
      });

      expect(result.isError).toBe(true);
      const data = parseToolResult(result);
      expect(data.error.code).toBe("INVALID_PARAMETER");
    });

    it("365日超でエラーを返す", async () => {
      const result = await client.callTool({
        name: "find_best_days",
        arguments: {
          purpose: "wedding",
          start_date: "2026-01-01",
          end_date: "2027-06-01",
        },
      });

      expect(result.isError).toBe(true);
      const data = parseToolResult(result);
      expect(data.error.code).toBe("RANGE_TOO_LARGE");
    });
  });

  describe("call_tool: get_calendar_range", () => {
    it("指定範囲の暦情報を返す", async () => {
      const result = await client.callTool({
        name: "get_calendar_range",
        arguments: {
          start: "2026-04-01",
          end: "2026-04-10",
        },
      });

      const data = parseToolResult(result);
      expect(data.start).toBe("2026-04-01");
      expect(data.end).toBe("2026-04-10");
      expect(data.count).toBe(10);
      expect(data.dates).toHaveLength(10);
    });

    it("六曜フィルターが動作する", async () => {
      const result = await client.callTool({
        name: "get_calendar_range",
        arguments: {
          start: "2026-04-01",
          end: "2026-04-30",
          filter_rokuyo: "大安",
        },
      });

      const data = parseToolResult(result);
      expect(data.count).toBeLessThan(30);
      for (const d of data.dates) {
        expect(d.rokuyo).toBe("大安");
      }
    });

    it("暦注フィルターが動作する", async () => {
      const result = await client.callTool({
        name: "get_calendar_range",
        arguments: {
          start: "2026-04-01",
          end: "2026-06-30",
          filter_rekichu: "一粒万倍日",
        },
      });

      const data = parseToolResult(result);
      for (const d of data.dates) {
        expect(d.rekichu).toContain("一粒万倍日");
      }
    });

    it("不正な日付でエラーを返す", async () => {
      const result = await client.callTool({
        name: "get_calendar_range",
        arguments: {
          start: "bad-date",
          end: "2026-04-30",
        },
      });

      expect(result.isError).toBe(true);
      const data = parseToolResult(result);
      expect(data.error.code).toBe("INVALID_DATE");
    });

    it("93日超でエラーを返す", async () => {
      const result = await client.callTool({
        name: "get_calendar_range",
        arguments: {
          start: "2026-01-01",
          end: "2026-12-31",
        },
      });

      expect(result.isError).toBe(true);
      const data = parseToolResult(result);
      expect(data.error.code).toBe("RANGE_TOO_LARGE");
    });

    it("end < startでエラーを返す", async () => {
      const result = await client.callTool({
        name: "get_calendar_range",
        arguments: {
          start: "2026-04-30",
          end: "2026-04-01",
        },
      });

      expect(result.isError).toBe(true);
      const data = parseToolResult(result);
      expect(data.error.code).toBe("INVALID_PARAMETER");
    });
  });

  describe("レスポンス形式", () => {
    it("TextContent型でJSON文字列を返す", async () => {
      const result = await client.callTool({
        name: "get_japanese_calendar",
        arguments: { date: "2026-04-12" },
      });

      const content = (result as any).content;
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe("text");
      expect(typeof content[0].text).toBe("string");

      // JSON.parseが成功することを確認
      const parsed = JSON.parse(content[0].text);
      expect(parsed).toBeDefined();
    });
  });
});
