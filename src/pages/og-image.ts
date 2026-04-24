/**
 * OG / Article image(Schema.org の image 必須フィールド用)
 *
 * Google Article Rich Results と Twitter / Discord / Slack カード用の
 * 1200x630 SVG を返す。動的生成不要の静的な Shirabe ブランディングロゴ。
 *
 * GET /og-default.svg で serve。SVG は JPEG/PNG 非サポートの Rich Results
 * card で表示されない可能性があるが、schema 検証は通過 + 多くの social
 * media preview では動作する。将来的に PNG 化する場合は Cloudflare Images
 * か外部 CDN を検討。
 *
 * sizes 1200x630 は OG 推奨(aspect 1.91:1)。
 */

/**
 * Shirabe の default OG / Article 画像を SVG 文字列として返す。
 *
 * 色と typography は `/` top page の header と揃える(#1a1a2e / #2563eb)。
 * font-family は system font stack。SVG レンダラがフォント fallback しても
 * 意味が通るよう、ASCII + 日本語 + 英字の 3 段構成で冗長化する。
 */
export function renderOgDefaultSvg(): string {
  const FONT = "system-ui, -apple-system, 'Segoe UI', 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Shirabe — Japanese AI-Native API Platform">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#f8fafc"/>
<stop offset="1" stop-color="#e0e7ff"/>
</linearGradient>
</defs>
<rect width="1200" height="630" fill="url(#bg)"/>
<g transform="translate(80,180)">
<text font-family="${FONT}" font-size="150" font-weight="800" fill="#1a1a2e" letter-spacing="-3">Shirabe<tspan fill="#2563eb">.</tspan></text>
<text y="90" font-family="${FONT}" font-size="42" font-weight="500" fill="#374151">日本特化 AI ネイティブ API プラットフォーム</text>
<text y="150" font-family="${FONT}" font-size="32" fill="#6b7280">Japanese AI-Native API Platform</text>
</g>
<g transform="translate(80,560)">
<text font-family="${FONT}" font-size="30" font-weight="600" fill="#2563eb">shirabe.dev</text>
<text x="270" font-family="${FONT}" font-size="24" fill="#6b7280">Calendar · Address · Japanese Text</text>
</g>
</svg>`;
}
