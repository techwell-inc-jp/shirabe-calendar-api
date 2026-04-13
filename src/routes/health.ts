/**
 * ヘルスチェックエンドポイント
 *
 * PRD Section 1.3 EP4: GET /health
 */
import { Hono } from "hono";

const health = new Hono();

health.get("/", (c) => {
  return c.json({
    status: "ok",
    version: c.env && (c.env as Record<string, string>).API_VERSION
      ? (c.env as Record<string, string>).API_VERSION
      : "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

export { health };
