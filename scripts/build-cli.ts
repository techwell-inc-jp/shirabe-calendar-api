/**
 * CLI バンドルスクリプト
 *
 * src/cli.ts を dist/cli.js にバンドルする。
 * npm publish 前に実行する。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

if (!existsSync("dist")) {
  mkdirSync("dist");
}

const esbuildBin =
  "node_modules/.pnpm/esbuild@0.27.7/node_modules/esbuild/bin/esbuild";

execFileSync(
  "node",
  [
    esbuildBin,
    "src/cli.ts",
    "--bundle",
    "--platform=node",
    "--target=node18",
    "--format=esm",
    "--outfile=dist/cli.js",
  ],
  { stdio: "inherit" }
);

// shebang を先頭に追加
const content = readFileSync("dist/cli.js", "utf-8");
writeFileSync("dist/cli.js", `#!/usr/bin/env node\n${content}`);

console.log("✓ dist/cli.js built successfully");
