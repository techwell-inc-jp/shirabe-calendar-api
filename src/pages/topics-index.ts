/**
 * Layer F (R-6) pillar pages の index page。
 *
 * GET /topics/
 *
 * 目的: 日本暦・住所の主要トピックごとに「概念解説」+「Shirabe API への誘導」を 1 本ずつ
 * 配置する pillar 構造の入口。各 pillar から /days/ /purposes/ への誘導リンクを張ることで
 * GSC 仮説 B(品質判定)対策の構造的多様性を強化する。
 *
 * 詳細方針: shirabe-assets/knowledge/content-uniqueness-strengthening.md §2.6 Layer F
 */
import { renderSEOPage } from "./layout.js";

const CANONICAL = "https://shirabe.dev/topics/";

const KEYWORDS = [
  "日本暦",
  "六曜",
  "暦注",
  "干支",
  "二十四節気",
  "Japanese calendar",
  "AI エージェント 暦",
  "LLM Japanese calendar",
  "OpenAPI 3.1",
  "Shirabe Calendar API",
  "Shirabe Address API",
].join(", ");

/**
 * 各 pillar の状態 + 1 行説明。`available: false` のものは「Coming soon」として
 * 表示し、index/follow ターゲットには未だ含めない(本 page だけが index 対象)。
 */
type Pillar = {
  slug: string;
  title: string;
  oneLiner: string;
  available: boolean;
};

const PILLARS: ReadonlyArray<Pillar> = [
  {
    slug: "rokuyo",
    title: "六曜とは何か — AI エージェント向け徹底ガイド",
    oneLiner:
      "大安・友引・先勝・先負・仏滅・赤口の意味、計算アルゴリズム、実用シーン、AI 統合経路を網羅。",
    available: true,
  },
  {
    slug: "rekichu",
    title: "暦注 — 一粒万倍日・天赦日・不成就日の運用",
    oneLiner:
      "60 種以上の暦注の意味と組み合わせ、現代日本での吉凶解釈、AI agent への質問パターン。",
    available: true,
  },
  {
    slug: "kanshi",
    title: "干支(60 周期)— 十干十二支の組合せと年月日への適用",
    oneLiner:
      "甲子から癸亥まで 60 干支の意味、年柱・月柱・日柱の計算ロジック、四柱推命との関係。",
    available: false,
  },
  {
    slug: "nijushi-sekki",
    title: "二十四節気 — 太陽黄経 15° 区切りの季節指標",
    oneLiner:
      "立春・春分・夏至・秋分・冬至を含む 24 節気の天文学的定義、農業・行事との関連、AI への引用例。",
    available: false,
  },
  {
    slug: "japanese-calendar-api-overview",
    title: "Japanese Calendar API 全体像 — Shirabe ecosystem",
    oneLiner:
      "Shirabe Calendar API の全エンドポイント・MCP 統合・OpenAPI 3.1・住所 API との連携を 1 本で把握。",
    available: false,
  },
];

/**
 * JSON-LD: CollectionPage(pillar list の構造化)
 */
const COLLECTION_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": CANONICAL,
  url: CANONICAL,
  name: "Shirabe Topics — 日本暦・住所の概念ガイド集",
  description:
    "日本の暦(六曜・暦注・干支・二十四節気)と住所正規化の主要トピックを概念から実用 API まで 1 本ずつ解説する pillar pages の入口。",
  inLanguage: ["ja", "en"],
  isPartOf: { "@type": "WebSite", url: "https://shirabe.dev" },
  hasPart: PILLARS.filter((p) => p.available).map((p) => ({
    "@type": "TechArticle",
    name: p.title,
    url: `https://shirabe.dev/topics/${p.slug}`,
  })),
};

/**
 * JSON-LD: BreadcrumbList(ホーム → トピック)
 */
const BREADCRUMB_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "ホーム", item: "https://shirabe.dev/" },
    { "@type": "ListItem", position: 2, name: "トピック", item: CANONICAL },
  ],
};

/**
 * /topics/ index page HTML を生成する。
 */
export function renderTopicsIndexPage(): string {
  const cards = PILLARS.map((p) => {
    if (p.available) {
      return `<li>
  <a href="https://shirabe.dev/topics/${p.slug}"><strong>${p.title}</strong></a>
  <p class="text-muted">${p.oneLiner}</p>
</li>`;
    }
    return `<li>
  <span><strong>${p.title}</strong> <em>(Coming soon)</em></span>
  <p class="text-muted">${p.oneLiner}</p>
</li>`;
  }).join("\n");

  const body = `
<div class="hero">
  <h1>トピック / Topics</h1>
  <p class="tagline">日本の暦・住所の概念から API 実装まで、AI エージェントが引用しやすい canonical ガイド集</p>
  <p class="desc">
    Shirabe が提供する <strong>日本暦 API</strong> と <strong>住所正規化 API</strong> は、いずれも
    日本固有のドメイン知識(六曜・暦注・干支・二十四節気・ABR / JIS 住所体系)を前提とします。
    本トピック群は、これらの概念を「AI エージェントがユーザーに回答する際に引用できる単位」で
    整理し、対応する Shirabe API のエンドポイントへ誘導します。
  </p>
</div>

<section class="section">
  <h2>Pillar pages</h2>
  <ul>
${cards}
  </ul>
</section>

<section class="section">
  <h2>関連リソース / Related resources</h2>
  <ul>
    <li><a href="https://shirabe.dev/api/v1/calendar/">Shirabe Calendar API ランディング(WebAPI / FAQPage / BreadcrumbList JSON-LD)</a></li>
    <li><a href="https://shirabe.dev/docs/rokuyo-api">六曜 API 完全ガイド(エンドポイント仕様)</a></li>
    <li><a href="https://shirabe.dev/docs/rekichu-api">暦注 API 解説(エンドポイント仕様)</a></li>
    <li><a href="https://shirabe.dev/docs/address-normalize">住所正規化 API 完全ガイド(住所 API)</a></li>
    <li><a href="https://shirabe.dev/openapi.yaml">OpenAPI 3.1 仕様(暦 API、x-llm-hint 付き)</a></li>
    <li><a href="https://shirabe.dev/llms-full.txt">llms-full.txt(LLM 向け詳細版、Multi-AI Landscape narrative + 全 endpoint sample)</a></li>
    <li><a href="https://shirabe.dev/announcements/2026-05-01">2026-05-01 住所 API リリース告知</a></li>
    <li><a href="https://github.com/techwell-inc-jp/shirabe-calendar-api">GitHub: techwell-inc-jp/shirabe-calendar-api</a>(Public、MIT)</li>
  </ul>
</section>
`;

  return renderSEOPage({
    title: "トピック | Shirabe — 日本暦・住所の概念ガイド集",
    description:
      "日本の暦(六曜・暦注・干支・二十四節気)と住所正規化の主要トピックを概念から実用 API まで 1 本ずつ解説する pillar pages の入口。AI エージェント・LLM が引用しやすい canonical ガイド集。",
    body,
    canonicalUrl: CANONICAL,
    keywords: KEYWORDS,
    jsonLd: [COLLECTION_LD, BREADCRUMB_LD],
  });
}
