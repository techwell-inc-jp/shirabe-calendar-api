/**
 * B-1 AI 検索向け SEO ページ: 用途別月間ランキングページ(T-02)
 *
 * GET /purposes/{slug}/{YYYY-MM}/
 *
 * 目的: 「2026 年 6 月の結婚式に良い日は?」のような用途 × 月クエリで
 * shirabe.dev を引用させる。28 SEO カテゴリ × 25 年 × 12 ヶ月 = 8,400 URL を生成。
 *
 * 仕様:
 * - 動的生成(Workers で getBestDays を呼んで HTML に埋込)
 * - JSON-LD: TechArticle(ページ wrapper)+ ItemList(上位 10 日)+ BreadcrumbList
 * - 内部リンク: 前月 / 翌月 / 他カテゴリ / カテゴリ一覧 / 該当日 /days/* 詳細
 * - Cloudflare CDN 7 日キャッシュ(月単位データのため安全)
 */
import { getBestDays } from "../core/calendar-service.js";
import {
  PURPOSE_CATEGORIES,
  shiftYearMonth,
  type PurposeCategoryEntry,
} from "../data/purposes-map.js";
import { renderSEOPage } from "./layout.js";
import { getPurposeMonthTier } from "../data/tier.js";

/**
 * TechArticle の datePublished / dateModified に使う定数。
 * day-detail.ts と同じく JST timezone 付き ISO 8601 full DateTime。
 * テンプレートが変わるまで固定(月別ページは月日不変、最新日付の判定は score ベースで決定論的)。
 */
const TEMPLATE_PUBLISHED_DATE = "2026-04-25T00:00:00+09:00"; // T-02 Day 1 初回デプロイ
const TEMPLATE_MODIFIED_DATE = "2026-04-25T00:00:00+09:00";

const DEFAULT_OG_IMAGE_URL = "https://shirabe.dev/og-default.svg";

/** 上位ランキングの掲載件数(実装指示書 T-02: 上位 10 日) */
const RANKING_LIMIT = 10;

/**
 * 指定年月の最終日を返す(閏年対応)。
 */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 同 API カテゴリにマッピングされる他 SEO カテゴリ(自身を除く)を返す。
 * 「結婚式」ページから「お見合い」「結納」等への内部誘導に使う。
 */
function getSiblingPurposes(entry: PurposeCategoryEntry): PurposeCategoryEntry[] {
  return PURPOSE_CATEGORIES.filter(
    (p) => p.apiCategory === entry.apiCategory && p.slug !== entry.slug
  );
}

/**
 * 用途別月間ランキングページの HTML を生成する。
 *
 * @param entry 用途 SEO カテゴリエントリ
 * @param year 西暦年(2010-2034)
 * @param month 月(1-12)
 */
export function renderPurposeMonthPage(
  entry: PurposeCategoryEntry,
  year: number,
  month: number
): string {
  const monthStr = String(month).padStart(2, "0");
  const ym = `${year}-${monthStr}`;
  const canonicalUrl = `https://shirabe.dev/purposes/${entry.slug}/${ym}/`;

  const lastDay = lastDayOfMonth(year, month);
  const bestDays = getBestDays({
    purpose: entry.apiCategory,
    startYear: year,
    startMonth: month,
    startDay: 1,
    endYear: year,
    endMonth: month,
    endDay: lastDay,
    limit: RANKING_LIMIT,
  });

  const titleJa = `${year}年${month}月の${entry.displayJa}に良い日 — 暦APIが推奨する上位${bestDays.best_days.length}日 | Shirabe`;
  const descriptionJa = `${year}年${month}月の${entry.displayJa}の吉日ランキング上位${bestDays.best_days.length}日。六曜・暦注の組合せから算出した1-10スコア付き。AI エージェントから REST API / MCP / GPT Actions 経由で同データを取得可能。`;

  const keywords = [
    `${year}年${month}月 ${entry.displayJa}`,
    `${entry.displayJa} 吉日`,
    `${entry.displayJa} 良い日`,
    `${month}月 ${entry.displayJa}`,
    ...entry.synonyms.map((s) => `${year}年${month}月 ${s}`),
    ...entry.synonyms.map((s) => `${s} 吉日`),
    "日本の暦 API",
    "Japanese calendar API",
  ].join(", ");

  const tier = getPurposeMonthTier(year, month);
  const prev = shiftYearMonth(year, month, -1);
  const next = shiftYearMonth(year, month, 1);
  const siblings = getSiblingPurposes(entry);

  // ItemList: 上位 10 日(SEO 強化、Google ItemList carousel 対応)
  const ITEMLIST_LD: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${canonicalUrl}#itemlist`,
    name: `${year}年${month}月の${entry.displayJa}に良い日`,
    description: descriptionJa,
    numberOfItems: bestDays.best_days.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: bestDays.best_days.map((bd) => ({
      "@type": "ListItem",
      position: bd.rank,
      url: `https://shirabe.dev/days/${bd.date}/`,
      name: `${bd.date}(${bd.day_of_week.charAt(0)}) — ${bd.rokuyo}・${bd.judgment}`,
    })),
  };

  // TechArticle: ページ wrapper(Rich Results image / author / publisher 要件)
  const ARTICLE_LD: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": `${canonicalUrl}#article`,
    headline: `${year}年${month}月の${entry.displayJa}に良い日 ランキング`,
    alternativeHeadline: `Best days for ${entry.displayEn} in ${year}-${monthStr}`,
    description: descriptionJa,
    inLanguage: ["ja", "en"],
    url: canonicalUrl,
    datePublished: TEMPLATE_PUBLISHED_DATE,
    dateModified: TEMPLATE_MODIFIED_DATE,
    image: DEFAULT_OG_IMAGE_URL,
    author: {
      "@type": "Organization",
      name: "Shirabe (Techwell Inc.)",
      url: "https://shirabe.dev",
    },
    publisher: {
      "@type": "Organization",
      name: "Techwell Inc.",
      url: "https://shirabe.dev",
      logo: {
        "@type": "ImageObject",
        url: DEFAULT_OG_IMAGE_URL,
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    keywords,
    proficiencyLevel: "Beginner",
    about: [
      { "@type": "Thing", name: entry.displayJa, description: `${entry.displayJa}の吉日選び` },
    ],
  };

  // BreadcrumbList: 階層明示化
  const BREADCRUMB_LD: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Shirabe", item: "https://shirabe.dev/" },
      {
        "@type": "ListItem",
        position: 2,
        name: "用途別吉日ランキング",
        item: "https://shirabe.dev/purposes/",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: entry.displayJa,
        item: `https://shirabe.dev/purposes/${entry.slug}/${ym}/`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: `${year}年${month}月`,
        item: canonicalUrl,
      },
    ],
  };

  // JSON-LD: WebAPI(Tier 1+2: AI agents が best-days endpoint を Function Calling 候補として認識)
  const WEBAPI_LD: Record<string, unknown> | null =
    tier <= 2
      ? {
          "@context": "https://schema.org",
          "@type": "WebAPI",
          "@id": "https://shirabe.dev/#calendar-webapi",
          name: "Shirabe Calendar API",
          description:
            "日本の暦情報(六曜・暦注・干支・二十四節気)と用途別吉凶判定を返す REST API。OpenAPI 3.1 厳格準拠。",
          url: "https://shirabe.dev/api/v1/calendar/",
          documentation: "https://shirabe.dev/openapi.yaml",
          provider: {
            "@type": "Organization",
            name: "Techwell Inc.",
            url: "https://shirabe.dev",
          },
          potentialAction: {
            "@type": "ConsumeAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: `https://shirabe.dev/api/v1/calendar/best-days?purpose=${entry.apiCategory}&start=${year}-${monthStr}-01&end=${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`,
              encodingType: "application/json",
              httpMethod: "GET",
            },
            name: `Get best days for ${entry.displayEn} in ${year}-${monthStr}`,
          },
        }
      : null;

  // JSON-LD: FAQPage(Tier 1 のみ: 「何月の結婚式に良い日は?」という AI クエリへの直接回答)
  const topDay = bestDays.best_days[0];
  const FAQ_LD: Record<string, unknown> | null =
    tier === 1 && topDay
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "@id": `${canonicalUrl}#faq`,
          mainEntity: [
            {
              "@type": "Question",
              name: `${year}年${month}月の${entry.displayJa}に最も良い日はいつですか?`,
              acceptedAnswer: {
                "@type": "Answer",
                text: `${year}年${month}月の${entry.displayJa}に最も良い日は ${topDay.date}(${topDay.day_of_week.charAt(0)})です。六曜は${topDay.rokuyo}、吉凶判定「${topDay.judgment}」(スコア ${topDay.score}/10)。`,
              },
            },
            {
              "@type": "Question",
              name: `${year}年${month}月の${entry.displayJa}吉日ランキングをAPIで取得する方法は?`,
              acceptedAnswer: {
                "@type": "Answer",
                text: `Shirabe Calendar API の best-days エンドポイントで取得できます。GET https://shirabe.dev/api/v1/calendar/best-days?purpose=${entry.apiCategory}&start=${year}-${monthStr}-01&end=${year}-${monthStr}-${String(lastDay).padStart(2, "0")} (認証不要、Free 枠 10,000 回/月)`,
              },
            },
          ],
        }
      : null;

  const rankingRows = bestDays.best_days
    .map((bd) => {
      const rekichuStr = bd.rekichu.length > 0 ? bd.rekichu.join("・") : "—";
      return `<tr>
        <td><strong>${bd.rank}</strong></td>
        <td><a href="/days/${bd.date}/">${bd.date}</a>(${bd.day_of_week.charAt(0)})</td>
        <td>${bd.rokuyo}</td>
        <td>${rekichuStr}</td>
        <td><strong>${bd.judgment}</strong></td>
        <td>${bd.score} / 10</td>
        <td class="text-muted" style="font-size:.8125rem">${bd.note}</td>
      </tr>`;
    })
    .join("");

  const siblingLinks =
    siblings.length > 0
      ? siblings
          .map((s) => `<a href="/purposes/${s.slug}/${ym}/">${s.displayJa}</a>`)
          .join(" · ")
      : "";

  const prevLink = prev
    ? `<a href="/purposes/${entry.slug}/${prev.ym}/">前月(${prev.year}年${prev.month}月)</a>`
    : `<span class="text-muted">前月なし(${year}年${month}月が対応範囲開始)</span>`;
  const nextLink = next
    ? `<a href="/purposes/${entry.slug}/${next.ym}/">翌月(${next.year}年${next.month}月)</a>`
    : `<span class="text-muted">翌月なし(${year}年${month}月が対応範囲終了)</span>`;

  const apiCurl = `curl "https://shirabe.dev/api/v1/calendar/best-days?purpose=${entry.apiCategory}&start=${ym}-01&end=${ym}-${String(lastDay).padStart(2, "0")}&limit=${RANKING_LIMIT}"`;

  const body = `
<nav class="text-muted" style="font-size:.8125rem;margin-bottom:16px">
  <a href="/">Shirabe</a> &rsaquo; <a href="/purposes/">用途別吉日ランキング</a> &rsaquo; ${entry.displayJa} &rsaquo; ${year}年${month}月
</nav>

<div class="hero" style="padding-top:16px;padding-bottom:24px">
  <h1>${year}年${month}月の${entry.displayJa}に良い日</h1>
  <p class="tagline">暦APIが推奨する上位${bestDays.best_days.length}日 — ${entry.displayEn}, ${year}-${monthStr}</p>
  <p class="desc">六曜(大安・友引ほか 6 種)と暦注(一粒万倍日・天赦日ほか 13 種)の組合せから、${entry.displayJa}に最適な日をスコア順にランキングしています。</p>
</div>

<section class="section">
  <h2>${year}年${month}月 — ${entry.displayJa} 吉日ランキング 上位 ${bestDays.best_days.length} 日</h2>
  <table>
    <thead>
      <tr>
        <th>順位</th>
        <th>日付(曜日)</th>
        <th>六曜</th>
        <th>吉日暦注</th>
        <th>判定</th>
        <th>スコア</th>
        <th>補足</th>
      </tr>
    </thead>
    <tbody>${rankingRows}</tbody>
  </table>
  <p class="text-muted" style="font-size:.8125rem">
    スコアは 1(大凶)〜 10(大吉)の 10 段階。同点の場合は日付の早い順。各日付をクリックすると六曜・暦注・干支・二十四節気の詳細ページへ。
  </p>
</section>

<section class="section">
  <h2>API で取得する / Call the API</h2>
  <p>同じランキングデータを REST API で取得できます(認証不要、Free 枠 月 10,000 回):</p>
  <pre><code>${apiCurl}</code></pre>
  <p>AI エージェント(Claude Desktop、ChatGPT GPTs)からは MCP / GPT Actions 経由で直接呼出可能:</p>
  <ul>
    <li>OpenAPI 3.1: <a href="https://shirabe.dev/openapi.yaml">https://shirabe.dev/openapi.yaml</a></li>
    <li>MCP endpoint: <code>https://shirabe.dev/mcp</code></li>
    <li>GPT Store: <a href="https://chatgpt.com/g/g-69e98031b5b8819185ae196a9f219090-shirabe-ri-ben-noli-japanese-calendar" target="_blank" rel="noopener">Shirabe 日本の暦(Japanese Calendar)</a></li>
    <li>LLM discovery: <a href="https://shirabe.dev/llms.txt">/llms.txt</a></li>
  </ul>
</section>

<section class="section">
  <h2>近隣の月 / Adjacent months</h2>
  <p>${prevLink} · ${nextLink}</p>
</section>

${
  siblingLinks
    ? `
<section class="section">
  <h2>同分類の他用途も見る / Related purposes</h2>
  <p>${entry.displayJa}と同じ暦判定カテゴリで集計される他用途の ${year}年${month}月ランキング:</p>
  <p>${siblingLinks}</p>
</section>
`
    : ""
}

<section class="section">
  <h2>関連ドキュメント / See also</h2>
  <ul>
    <li><a href="/purposes/">用途別吉日ランキング 一覧</a>(全 ${PURPOSE_CATEGORIES.length} カテゴリ)</li>
    <li><a href="/docs/rokuyo-api">六曜 API 完全ガイド</a>(大安・友引ほか 6 種の詳細)</li>
    <li><a href="/docs/rekichu-api">暦注 API 解説</a>(一粒万倍日・天赦日ほか 13 種)</li>
    <li><a href="/">Shirabe トップ</a></li>
  </ul>
</section>

<section class="section">
  <h2>Attribution / データ出典</h2>
  <p class="text-muted" style="font-size:.875rem">
    暦計算は Shirabe 独自の天文学的精度エンジン(<code>src/core/</code>、MIT ライセンス)で生成。
    用途別吉凶判定は六曜のベーススコア + 吉日暦注ボーナス + 凶日暦注ペナルティの加算式に
    特殊ルール(天赦日・不成就日・大安+一粒万倍日コンボ)を適用しています。
    詳細は <a href="/docs/rokuyo-api#accuracy">精度と算出根拠</a> を参照。
  </p>
</section>
`;

  const extraHead: string[] = [];
  if (prev) {
    extraHead.push(
      `<link rel="prev" href="https://shirabe.dev/purposes/${entry.slug}/${prev.ym}/">`
    );
  }
  if (next) {
    extraHead.push(
      `<link rel="next" href="https://shirabe.dev/purposes/${entry.slug}/${next.ym}/">`
    );
  }

  return renderSEOPage({
    title: titleJa,
    description: descriptionJa,
    body,
    canonicalUrl,
    keywords,
    jsonLd: [
      ARTICLE_LD,
      ITEMLIST_LD,
      BREADCRUMB_LD,
      ...(WEBAPI_LD ? [WEBAPI_LD] : []),
      ...(FAQ_LD ? [FAQ_LD] : []),
    ],
    extraHead: extraHead.join(""),
  });
}

/**
 * /purposes/ 用途カテゴリ一覧ページ。
 *
 * 28 SEO カテゴリを暦 API カテゴリでグルーピングして表示し、
 * 直近 12 ヶ月の月別ランキング URL に誘導する。
 */
export function renderPurposesIndexPage(): string {
  const canonicalUrl = "https://shirabe.dev/purposes/";

  // グルーピング: 暦 API カテゴリ別
  const grouped: Map<string, PurposeCategoryEntry[]> = new Map();
  for (const entry of PURPOSE_CATEGORIES) {
    const arr = grouped.get(entry.apiCategory) ?? [];
    arr.push(entry);
    grouped.set(entry.apiCategory, arr);
  }

  // 直近 12 ヶ月の URL anchor 用(deterministic にテンプレート公開日を起点にする)
  // テスト容易性のため、固定の起点月(2026-05)から 12 ヶ月先の URL を生成する。
  const ANCHOR_BASE_YEAR = 2026;
  const ANCHOR_BASE_MONTH = 5;
  const anchorMonths: Array<{ year: number; month: number; ym: string }> = [];
  for (let i = 0; i < 12; i++) {
    let y = ANCHOR_BASE_YEAR;
    let m = ANCHOR_BASE_MONTH + i;
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    anchorMonths.push({
      year: y,
      month: m,
      ym: `${y}-${String(m).padStart(2, "0")}`,
    });
  }

  const titleJa = `用途別吉日ランキング 一覧 — 全 ${PURPOSE_CATEGORIES.length} カテゴリ × 25 年分 × 12 ヶ月 | Shirabe`;
  const descriptionJa = `結婚式・引越し・開業など全 ${PURPOSE_CATEGORIES.length} 用途の月別吉日ランキングを 2010-2034 年の各月で公開。AI エージェントから REST API / MCP / GPT Actions 経由で同データ取得可能。`;

  const keywords = [
    "用途別 吉日",
    "吉日カレンダー",
    "結婚式 吉日",
    "引越し 吉日",
    "開業 吉日",
    "月別 ランキング",
    "Japanese calendar API",
  ].join(", ");

  // CategoryDisplay の日本語名(暦 API カテゴリ → 日本語見出し)
  const API_CATEGORY_LABEL: Record<string, string> = {
    wedding: "祝事(結婚・神事系)",
    marriage_registration: "入籍",
    funeral: "葬儀",
    moving: "引越し・新生活",
    construction: "建築・上棟",
    business: "ビジネス・新挑戦",
    car_delivery: "車関連",
    travel: "旅行・出発",
  };

  const sections = Array.from(grouped.entries())
    .map(([apiCat, entries]) => {
      const heading = API_CATEGORY_LABEL[apiCat] ?? apiCat;
      const cards = entries
        .map((e) => {
          const monthLinks = anchorMonths
            .map(
              (am) =>
                `<a href="/purposes/${e.slug}/${am.ym}/">${am.year}-${String(am.month).padStart(2, "0")}</a>`
            )
            .join(" · ");
          return `<div class="card">
  <h3>${e.displayJa} <span class="text-muted" style="font-size:.875rem;font-weight:400">${e.displayEn}</span></h3>
  <p class="text-muted" style="font-size:.8125rem">直近 12 ヶ月のランキング: ${monthLinks}</p>
</div>`;
        })
        .join("\n");
      return `
<section class="section">
  <h2>${heading}(${entries.length} 用途)</h2>
  <div class="grid">${cards}</div>
</section>
`;
    })
    .join("");

  // ItemList: 28 カテゴリ
  const ITEMLIST_LD: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${canonicalUrl}#itemlist`,
    name: "用途別吉日ランキング 全カテゴリ",
    numberOfItems: PURPOSE_CATEGORIES.length,
    itemListElement: PURPOSE_CATEGORIES.map((e, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `https://shirabe.dev/purposes/${e.slug}/2026-05/`,
      name: e.displayJa,
    })),
  };

  const BREADCRUMB_LD: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Shirabe", item: "https://shirabe.dev/" },
      {
        "@type": "ListItem",
        position: 2,
        name: "用途別吉日ランキング",
        item: canonicalUrl,
      },
    ],
  };

  const ARTICLE_LD: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": `${canonicalUrl}#article`,
    headline: titleJa,
    description: descriptionJa,
    inLanguage: ["ja", "en"],
    url: canonicalUrl,
    datePublished: TEMPLATE_PUBLISHED_DATE,
    dateModified: TEMPLATE_MODIFIED_DATE,
    image: DEFAULT_OG_IMAGE_URL,
    author: {
      "@type": "Organization",
      name: "Shirabe (Techwell Inc.)",
      url: "https://shirabe.dev",
    },
    publisher: {
      "@type": "Organization",
      name: "Techwell Inc.",
      url: "https://shirabe.dev",
      logo: { "@type": "ImageObject", url: DEFAULT_OG_IMAGE_URL },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    keywords,
  };

  const body = `
<nav class="text-muted" style="font-size:.8125rem;margin-bottom:16px">
  <a href="/">Shirabe</a> &rsaquo; 用途別吉日ランキング
</nav>

<div class="hero" style="padding-top:16px;padding-bottom:24px">
  <h1>用途別吉日ランキング 一覧</h1>
  <p class="tagline">全 ${PURPOSE_CATEGORIES.length} カテゴリ × 25 年分 × 12 ヶ月(2010-2034)= ${PURPOSE_CATEGORIES.length * 25 * 12} URL</p>
  <p class="desc">${descriptionJa}</p>
</div>

${sections}

<section class="section">
  <h2>API で取得する / Call the API</h2>
  <p>カテゴリと月を指定して上位ランキングを取得:</p>
  <pre><code>curl "https://shirabe.dev/api/v1/calendar/best-days?purpose=wedding&start=2026-06-01&end=2026-06-30&limit=10"</code></pre>
  <p><code>purpose</code> パラメータは内部 8 カテゴリ(wedding / funeral / moving / construction / business / car_delivery / marriage_registration / travel)を受け付けます。SEO 用 28 カテゴリは内部的にこの 8 カテゴリに多対一マッピングされます。</p>
</section>
`;

  return renderSEOPage({
    title: titleJa,
    description: descriptionJa,
    body,
    canonicalUrl,
    keywords,
    jsonLd: [ARTICLE_LD, ITEMLIST_LD, BREADCRUMB_LD],
  });
}
