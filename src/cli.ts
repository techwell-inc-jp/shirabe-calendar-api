/* eslint-disable no-var */
declare var process: {
  env: Record<string, string | undefined>;
  exit(code: number): never;
  stderr: { write(s: string): boolean };
};
declare function fetch(
  input: string,
  init?: { headers?: Record<string, string> }
): Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }>;
declare class URL {
  constructor(input: string);
  searchParams: { set(name: string, value: string): void };
  toString(): string;
}

/**
 * @shirabe-api/calendar-mcp 窶・stdio MCP 繧ｵ繝ｼ繝舌・ CLI
 *
 * 繝ｭ繝ｼ繧ｫ繝ｫ縺ｧ stdio MCP 繧ｵ繝ｼ繝舌・繧定ｵｷ蜍輔＠縲√ヤ繝ｼ繝ｫ蜻ｼ縺ｳ蜃ｺ縺励ｒ
 * shirabe.dev 縺ｮ REST API 縺ｫ繝励Ο繧ｭ繧ｷ縺吶ｋ縲・ *
 * 菴ｿ縺・婿:
 *   SHIRABE_API_KEY=shrb_xxx npx @shirabe-api/calendar-mcp
 *
 * Claude Desktop 縺ｮ claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "shirabe-calendar": {
 *         "command": "npx",
 *         "args": ["@shirabe-api/calendar-mcp"],
 *         "env": { "SHIRABE_API_KEY": "shrb_your_api_key" }
 *       }
 *     }
 *   }
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  GET_JAPANESE_CALENDAR_NAME,
  GET_JAPANESE_CALENDAR_DESCRIPTION,
  getJapaneseCalendarSchema,
  FIND_BEST_DAYS_NAME,
  FIND_BEST_DAYS_DESCRIPTION,
  findBestDaysSchema,
  GET_CALENDAR_RANGE_NAME,
  GET_CALENDAR_RANGE_DESCRIPTION,
  getCalendarRangeSchema,
} from "./mcp/tools.js";

/** API 繝吶・繧ｹ URL */
const API_BASE = "https://shirabe.dev/api/v1/calendar";

/**
 * 迺ｰ蠅・､画焚縺九ｉ API 繧ｭ繝ｼ繧貞叙蠕励☆繧・ */
function getApiKey(): string {
  const key = process.env.SHIRABE_API_KEY;
  if (!key) {
    process.stderr.write(
      "[shirabe] Error: SHIRABE_API_KEY environment variable is required.\n" +
        "  Get your API key at https://shirabe.dev\n"
    );
    process.exit(1);
  }
  return key;
}

/**
 * shirabe.dev REST API 縺ｫ繝ｪ繧ｯ繧ｨ繧ｹ繝医ｒ騾∽ｿ｡縺吶ｋ
 */
async function apiRequest(
  path: string,
  apiKey: string,
  params?: Record<string, string | undefined>
): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
  }

  const response = await fetch(url.toString(), {
    headers: { "X-API-Key": apiKey },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API request failed (${response.status}): ${body}`);
  }

  return response.json();
}

/**
 * MCP 繧ｵ繝ｼ繝舌・繧剃ｽ懈・縺励ヽEST API 繝励Ο繧ｭ繧ｷ繝・・繝ｫ繧堤匳骭ｲ縺吶ｋ
 */
function createCliMcpServer(apiKey: string): McpServer {
  const server = new McpServer({
    name: "shirabe-calendar",
    version: "1.0.0",
  });

  // Tool 1: get_japanese_calendar
  server.tool(
    GET_JAPANESE_CALENDAR_NAME,
    GET_JAPANESE_CALENDAR_DESCRIPTION,
    getJapaneseCalendarSchema,
    async ({ date, categories }) => {
      try {
        const params: Record<string, string | undefined> = {
          categories: categories ? categories.join(",") : undefined,
        };
        const result = await apiRequest(`/${date}`, apiKey, params);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: {
                  code: "API_ERROR",
                  message:
                    error instanceof Error
                      ? error.message
                      : "Unknown error occurred",
                },
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 2: find_best_days
  server.tool(
    FIND_BEST_DAYS_NAME,
    FIND_BEST_DAYS_DESCRIPTION,
    findBestDaysSchema,
    async ({ purpose, start_date, end_date, limit }) => {
      try {
        const params: Record<string, string | undefined> = {
          purpose,
          start: start_date,
          end: end_date,
          limit: limit !== undefined ? String(limit) : undefined,
        };
        const result = await apiRequest("/best-days", apiKey, params);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: {
                  code: "API_ERROR",
                  message:
                    error instanceof Error
                      ? error.message
                      : "Unknown error occurred",
                },
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 3: get_calendar_range
  server.tool(
    GET_CALENDAR_RANGE_NAME,
    GET_CALENDAR_RANGE_DESCRIPTION,
    getCalendarRangeSchema,
    async ({ start, end, filter_rokuyo, filter_rekichu }) => {
      try {
        const params: Record<string, string | undefined> = {
          start,
          end,
          filter_rokuyo,
          filter_rekichu,
        };
        const result = await apiRequest("/range", apiKey, params);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: {
                  code: "API_ERROR",
                  message:
                    error instanceof Error
                      ? error.message
                      : "Unknown error occurred",
                },
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

/**
 * CLI 繧ｨ繝ｳ繝医Μ繝昴う繝ｳ繝・ */
async function main(): Promise<void> {
  const apiKey = getApiKey();
  const server = createCliMcpServer(apiKey);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[shirabe] MCP server started (stdio)\n");
}

main().catch((error) => {
  process.stderr.write(`[shirabe] Fatal error: ${error}\n`);
  process.exit(1);
});
