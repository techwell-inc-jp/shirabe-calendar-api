/**
 * `*.yaml` をテキストモジュールとして import するための型宣言。
 *
 * Cloudflare Workers (Wrangler) の `[[rules]] type = "Text"` 設定と対になっており、
 * バンドル時に YAML ファイルの内容がそのまま文字列としてインポートされる。
 */
declare module "*.yaml" {
  const content: string;
  export default content;
}
