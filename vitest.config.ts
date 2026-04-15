import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";

/**
 * YAML ファイルをテキスト文字列としてデフォルトエクスポートする Vite プラグイン。
 *
 * Wrangler 本番バンドルでは wrangler.toml の `[[rules]] type = "Text"` で
 * 同等の変換が行われる。Vitest 実行時も同じ振る舞いを再現するためのもの。
 */
const yamlAsText = {
  name: "yaml-as-text",
  enforce: "pre" as const,
  transform(_code: string, id: string) {
    const cleanId = id.split("?")[0];
    if (cleanId.endsWith(".yaml") || cleanId.endsWith(".yml")) {
      const content = readFileSync(cleanId, "utf-8");
      return {
        code: `export default ${JSON.stringify(content)};`,
        map: null,
      };
    }
    return null;
  },
};

export default defineConfig({
  plugins: [yamlAsText],
  test: {
    globals: true,
    include: ["test/**/*.test.ts"],
  },
});
