/**
 * 静的ページ共通レイアウト
 *
 * 全ページ共通のHTML構造・CSS・ナビゲーションを提供する。
 */

/**
 * 共通CSSスタイル
 */
const STYLES = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:16px;-webkit-text-size-adjust:100%}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;
  line-height:1.8;color:#1a1a2e;background:#fafafa}
a{color:#2563eb;text-decoration:none}
a:hover{text-decoration:underline}

.container{max-width:900px;margin:0 auto;padding:0 24px}

/* Header */
header{background:#fff;border-bottom:1px solid #e5e7eb;padding:16px 0}
header .container{display:flex;align-items:center;justify-content:space-between}
.logo{font-size:1.25rem;font-weight:700;color:#1a1a2e;letter-spacing:.02em}
.logo span{color:#2563eb}
header nav a{margin-left:24px;font-size:.875rem;color:#4b5563}
header nav a:hover{color:#2563eb;text-decoration:none}

/* Main */
main{padding:48px 0 64px}

/* Footer */
footer{background:#1a1a2e;color:#94a3b8;padding:40px 0;font-size:.8125rem;line-height:1.6}
footer .container{display:flex;flex-wrap:wrap;justify-content:space-between;gap:24px}
.footer-links{display:flex;flex-wrap:wrap;gap:16px}
.footer-links a{color:#94a3b8}
.footer-links a:hover{color:#fff}
.footer-copy{width:100%;text-align:center;margin-top:16px;padding-top:16px;border-top:1px solid #334155}

/* Typography */
h1{font-size:2rem;font-weight:700;margin-bottom:16px;line-height:1.3}
h2{font-size:1.375rem;font-weight:700;margin:48px 0 16px;padding-bottom:8px;border-bottom:2px solid #e5e7eb}
h3{font-size:1.125rem;font-weight:600;margin:32px 0 12px}
p{margin-bottom:16px}
ul,ol{margin:0 0 16px 24px}
li{margin-bottom:6px}
table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:.875rem}
th,td{padding:10px 12px;border:1px solid #e5e7eb;text-align:left}
th{background:#f8fafc;font-weight:600}
code{background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:.875em;font-family:"SF Mono",Consolas,monospace}
pre{background:#1e293b;color:#e2e8f0;padding:16px 20px;border-radius:8px;overflow-x:auto;margin-bottom:24px;font-size:.8125rem;line-height:1.6}
pre code{background:none;padding:0;color:inherit}

/* Utilities */
.badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:.75rem;font-weight:600}
.badge-blue{background:#dbeafe;color:#1d4ed8}
.badge-gray{background:#f1f5f9;color:#64748b}
.badge-green{background:#dcfce7;color:#166534}
.section{margin-bottom:48px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:16px}
.card h3{margin-top:0}
.grid{display:grid;gap:16px}
.grid-2{grid-template-columns:1fr 1fr}
.text-center{text-align:center}
.text-muted{color:#64748b}
.mt-0{margin-top:0}
.mb-8{margin-bottom:8px}

/* Hero */
.hero{text-align:center;padding:32px 0 48px}
.hero h1{font-size:2.5rem;margin-bottom:8px}
.hero .tagline{font-size:1.25rem;color:#64748b;margin-bottom:24px}
.hero .desc{max-width:640px;margin:0 auto 32px;color:#4b5563}

/* Responsive */
@media(max-width:640px){
  .hero h1{font-size:1.75rem}
  .hero .tagline{font-size:1rem}
  .grid-2{grid-template-columns:1fr}
  header .container{flex-direction:column;gap:12px}
  header nav a{margin-left:0;margin-right:16px}
  table{font-size:.75rem}
  th,td{padding:6px 8px}
  h2{font-size:1.125rem}
}
`;

/**
 * ページヘッダーHTML
 */
const HEADER = `
<header>
  <div class="container">
    <a href="/" class="logo">Shirabe<span>.</span></a>
    <nav>
      <a href="/">Home</a>
      <a href="https://github.com/techwell-inc-jp/shirabe-calendar-api" target="_blank" rel="noopener">Docs</a>
    </nav>
  </div>
</header>`;

/**
 * ページフッターHTML
 */
const FOOTER = `
<footer>
  <div class="container">
    <div class="footer-links">
      <a href="/">Home</a>
      <a href="/terms">利用規約</a>
      <a href="/privacy">プライバシーポリシー</a>
      <a href="/legal">特定商取引法に基づく表記</a>
      <a href="https://github.com/techwell-inc-jp/shirabe-calendar-api" target="_blank" rel="noopener">GitHub</a>
      <a href="https://www.techwell.jp/" target="_blank" rel="noopener noreferrer">運営会社</a>
    </div>
    <div class="footer-copy">&copy; 2026 株式会社テックウェル All rights reserved.</div>
  </div>
</footer>`;

/**
 * 共通レイアウトでページHTMLを生成する
 * @param title ページタイトル
 * @param body ページ本文HTML
 * @param description メタディスクリプション
 */
export function renderPage(title: string, body: string, description: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="robots" content="index,follow">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>S</text></svg>">
<style>${STYLES}</style>
</head>
<body>
${HEADER}
<main>
<div class="container">
${body}
</div>
</main>
${FOOTER}
</body>
</html>`;
}
