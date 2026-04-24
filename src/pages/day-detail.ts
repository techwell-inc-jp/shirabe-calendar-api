/**
 * B-1 AI 検索向け SEO ページ: 日付別暦情報ページ
 *
 * GET /days/{YYYY-MM-DD}/
 *
 * 目的: AI が「2026 年 6 月 15 日の六曜は?」のような日付特化クエリを受けたとき、
 * shirabe.dev の該当 URL を引用させる(T-01、B-1 加速スプリント)。
 * 約 83,000 URL(1873-01-01 〜 2100-12-31)の SEO surface area を生成。
 *
 * 仕様:
 * - 動的生成(Workers で getCalendarInfo を呼んで HTML に埋込)
 * - JSON-LD: Schema.org/TechArticle(意味論的に記事、Google Article Rich Results 対応)
 * - 内部リンク網: 前日 / 翌日 / 同月他日(月内 8 日分)
 * - Cloudflare CDN 7 日キャッシュ(日付不変データのため安全)
 */
import type { CalendarApiResponse } from "../core/calendar-service.js";
import { renderSEOPage } from "./layout.js";

/**
 * TechArticle の datePublished / dateModified に使う定数。
 *
 * ISO 8601 full DateTime 形式(`YYYY-MM-DDTHH:mm:ss±hh:mm`)で記述する。
 * Date のみの `YYYY-MM-DD` は schema.org valid だが、Google Rich Results では
 * "日時値が無効 / タイムゾーンがありません" warning 扱いになるため
 * JST (+09:00) を付与する。ページ内容は本テンプレートが変わるまで固定のため、
 * テンプレートの公開日 / 更新日(日本時間の深夜 0 時)で差し替える。
 */
const TEMPLATE_PUBLISHED_DATE = "2026-04-24T00:00:00+09:00"; // T-01 Day 1 初回デプロイ
const TEMPLATE_MODIFIED_DATE = "2026-04-24T00:00:00+09:00"; // TechArticle + OG image 対応時

/**
 * TechArticle.image に埋込む default OG / Article 画像の絶対 URL。
 * `src/pages/og-image.ts` で生成した SVG を serve する endpoint を指す。
 */
const DEFAULT_OG_IMAGE_URL = "https://shirabe.dev/og-default.svg";

/**
 * 指定日付 + N 日後の日付を YYYY-MM-DD 形式で返す。
 * 月またぎ・年またぎは JavaScript Date の自然な挙動に委ねる。
 */
function shiftDate(year: number, month: number, day: number, deltaDays: number): string {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + deltaDays);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * 指定月の日数を返す(閏年対応)。
 */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 同月内の代表日(8 日刻み)の YYYY-MM-DD 配列を返す。
 * 自日を除外して返す。例: 2026-06-15 の場合 → [01, 08, 22, 29]。
 */
function sameMonthAnchors(year: number, month: number, day: number): string[] {
  const last = daysInMonth(year, month);
  const anchors: number[] = [];
  for (let d = 1; d <= last; d += 8) {
    if (d !== day) anchors.push(d);
  }
  // 月末も追加(無ければ)
  if (!anchors.includes(last) && last !== day) anchors.push(last);
  const monthStr = String(month).padStart(2, "0");
  return anchors.slice(0, 8).map((d) => {
    const dd = String(d).padStart(2, "0");
    return `${year}-${monthStr}-${dd}`;
  });
}

/**
 * 数値配列から用途別スコアをランク順にテキスト化するためのラベル対応表。
 */
const CATEGORY_LABEL_JA: Record<string, string> = {
  wedding: "結婚式",
  funeral: "葬儀",
  moving: "引越し",
  construction: "着工・建築",
  business: "開業・契約",
  car_delivery: "納車",
  marriage_registration: "入籍",
  travel: "旅行",
};

const CATEGORY_LABEL_EN: Record<string, string> = {
  wedding: "wedding",
  funeral: "funeral",
  moving: "moving",
  construction: "construction",
  business: "business opening",
  car_delivery: "car delivery",
  marriage_registration: "marriage registration",
  travel: "travel",
};

/**
 * 曜日の英語表記を略記にする。
 */
function dayOfWeekShort(en: string): string {
  return en.slice(0, 3);
}

/**
 * 日付別ページの HTML を生成する。
 *
 * @param calendarData getCalendarInfo() の戻り値
 */
export function renderDayDetailPage(calendarData: CalendarApiResponse): string {
  const { date, wareki, day_of_week, rokuyo, rekichu, kanshi, nijushi_sekki, context, summary, kyureki } =
    calendarData;
  const [yearStr, monthStr, dayStr] = date.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  const canonicalUrl = `https://shirabe.dev/days/${date}/`;
  const prevDate = shiftDate(year, month, day, -1);
  const nextDate = shiftDate(year, month, day, 1);
  const monthAnchors = sameMonthAnchors(year, month, day);

  const titleJa = `${year}年${month}月${day}日(${day_of_week.ja.charAt(0)})の六曜・暦注 — ${rokuyo.name}・${
    rekichu.length > 0 ? rekichu[0].name : "暦注なし"
  } | Shirabe`;
  const descriptionJa = `${year}年${month}月${day}日(${day_of_week.ja})は${rokuyo.name}${
    rekichu.length > 0 ? "・" + rekichu.map((r) => r.name).join("・") : ""
  }。${summary} 用途別吉凶判定とAPIアクセス方法を掲載。`;

  const keywords = [
    `${year}年${month}月${day}日`,
    `${month}月${day}日 六曜`,
    `${month}月${day}日 暦注`,
    `${rokuyo.name}`,
    ...rekichu.map((r) => r.name),
    "日本の暦 API",
    "rokuyo calendar",
    "Japanese calendar API",
  ].join(", ");

  // 用途別スコアをランク順にソート
  const contextEntries = Object.entries(context).sort((a, b) => b[1].score - a[1].score);

  // JSON-LD: Schema.org/TechArticle(Google Article Rich Results 対応)
  // Event 型は Google Rich Results 上「コンサート等の興行」向けで calendar-day
  // 情報ページには適合せず invalid 判定になるため TechArticle に切替(T-01 Day 2 レビューで判明)。
  const ARTICLE_LD: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": `${canonicalUrl}#article`,
    headline: `${year}年${month}月${day}日(${day_of_week.ja}): ${rokuyo.name}${
      rekichu.length > 0 ? " × " + rekichu.map((r) => r.name).join(" × ") : ""
    }`,
    alternativeHeadline: `${date} — ${rokuyo.name}`,
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
      { "@type": "Thing", name: rokuyo.name, description: rokuyo.description },
      ...rekichu.map((r) => ({ "@type": "Thing", name: r.name, description: r.description })),
    ],
  };

  // JSON-LD: BreadcrumbList(階層の明示化、SEO 強化)
  const BREADCRUMB_LD: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Shirabe", item: "https://shirabe.dev/" },
      {
        "@type": "ListItem",
        position: 2,
        name: "日付別暦情報",
        item: `https://shirabe.dev/days/${year}-${monthStr}-01/`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: `${year}年${month}月${day}日`,
        item: canonicalUrl,
      },
    ],
  };

  const rekichuRows = rekichu
    .map(
      (r) =>
        `<tr><td>${r.name}</td><td>${r.reading}</td><td><span class="badge badge-${
          r.type === "吉" ? "green" : r.type === "凶" ? "gray" : "blue"
        }">${r.type}</span></td><td>${r.description}</td></tr>`
    )
    .join("");

  const contextRows = contextEntries
    .map(
      ([cat, ctx]) =>
        `<tr><td>${CATEGORY_LABEL_JA[cat] ?? cat}</td><td>${CATEGORY_LABEL_EN[cat] ?? cat}</td><td><strong>${
          ctx.judgment
        }</strong></td><td>${ctx.score} / 10</td><td>${ctx.note}</td></tr>`
    )
    .join("");

  const monthAnchorLinks = monthAnchors
    .map((d) => {
      const dd = parseInt(d.slice(-2), 10);
      return `<a href="/days/${d}/">${month}月${dd}日</a>`;
    })
    .join(" · ");

  const body = `
<nav class="text-muted" style="font-size:.8125rem;margin-bottom:16px">
  <a href="/">Shirabe</a> &rsaquo; <a href="/days/${year}-${monthStr}-01/">日付別暦情報</a> &rsaquo; ${year}年${month}月${day}日
</nav>

<div class="hero" style="padding-top:16px;padding-bottom:24px">
  <h1>${year}年${month}月${day}日(${day_of_week.ja.charAt(0)})の六曜・暦注</h1>
  <p class="tagline">${rokuyo.name}${
    rekichu.length > 0 ? " × " + rekichu.map((r) => r.name).join(" × ") : ""
  } — ${wareki}(${dayOfWeekShort(day_of_week.en)})</p>
  <p class="desc">${summary}</p>
  <p>
    <span class="badge badge-blue">${rokuyo.name}</span>
    ${rekichu
      .map(
        (r) =>
          `<span class="badge badge-${r.type === "吉" ? "green" : r.type === "凶" ? "gray" : "blue"}">${r.name}</span>`
      )
      .join(" ")}
    <span class="badge badge-gray">${kanshi.full}</span>
    ${nijushi_sekki.is_today ? `<span class="badge badge-blue">${nijushi_sekki.name}</span>` : ""}
  </p>
</div>

<section class="section">
  <h2>基本情報</h2>
  <table>
    <tbody>
      <tr><th>西暦</th><td>${date}(${day_of_week.ja})</td></tr>
      <tr><th>和暦</th><td>${wareki}</td></tr>
      <tr><th>旧暦</th><td>${kyureki.year}年${kyureki.is_leap_month ? "閏" : ""}${kyureki.month}月${
    kyureki.day
  }日(${kyureki.month_name})</td></tr>
      <tr><th>六曜</th><td><strong>${rokuyo.name}</strong>(${rokuyo.reading}) — ${rokuyo.description}</td></tr>
      <tr><th>干支</th><td>${kanshi.full}(${kanshi.jikkan} × ${kanshi.junishi}・${
    kanshi.junishi_animal.ja
  } / ${kanshi.junishi_animal.en})</td></tr>
      <tr><th>二十四節気</th><td>${nijushi_sekki.name}(${nijushi_sekki.reading})${
    nijushi_sekki.is_today ? " — <strong>本日が節気入り</strong>" : ""
  }</td></tr>
    </tbody>
  </table>
</section>

<section class="section">
  <h2>時間帯別の吉凶(六曜の細分)</h2>
  <table>
    <thead>
      <tr><th>朝</th><th>正午</th><th>午後</th><th>夕</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>${rokuyo.time_slots.morning}</td>
        <td>${rokuyo.time_slots.noon}</td>
        <td>${rokuyo.time_slots.afternoon}</td>
        <td>${rokuyo.time_slots.evening}</td>
      </tr>
    </tbody>
  </table>
</section>

${
  rekichu.length > 0
    ? `
<section class="section">
  <h2>この日の暦注(${rekichu.length}種)</h2>
  <table>
    <thead><tr><th>暦注</th><th>読み</th><th>吉凶</th><th>説明</th></tr></thead>
    <tbody>${rekichuRows}</tbody>
  </table>
</section>
`
    : ""
}

<section class="section">
  <h2>用途別吉凶判定</h2>
  <p class="text-muted">
    結婚式・引越しなど 8 カテゴリそれぞれについて、${rokuyo.name}${
    rekichu.length > 0 ? " + " + rekichu.map((r) => r.name).join(" + ") : ""
  } の組合せから判定とスコア(1-10)を算出しています。
  </p>
  <table>
    <thead><tr><th>用途(日本語)</th><th>Purpose (EN)</th><th>判定</th><th>スコア</th><th>補足</th></tr></thead>
    <tbody>${contextRows}</tbody>
  </table>
</section>

<section class="section">
  <h2>API で取得する / Call the API</h2>
  <p>同じ情報を REST API で取得できます(認証不要、Free 枠 月 10,000 回):</p>
  <pre><code>curl "https://shirabe.dev/api/v1/calendar/${date}"</code></pre>
  <p>AI エージェント(Claude Desktop、ChatGPT GPTs)からは MCP / GPT Actions 経由で直接呼出可能:</p>
  <ul>
    <li>OpenAPI 3.1: <a href="https://shirabe.dev/openapi.yaml">https://shirabe.dev/openapi.yaml</a></li>
    <li>MCP endpoint: <code>https://shirabe.dev/mcp</code></li>
    <li>GPT Store: <a href="https://chatgpt.com/g/g-69e98031b5b8819185ae196a9f219090-shirabe-ri-ben-noli-japanese-calendar" target="_blank" rel="noopener">Shirabe 日本の暦(Japanese Calendar)</a></li>
    <li>LLM discovery: <a href="https://shirabe.dev/llms.txt">/llms.txt</a></li>
  </ul>
</section>

<section class="section">
  <h2>近隣の日付 / Nearby dates</h2>
  <p>
    <a href="/days/${prevDate}/">前日(${prevDate})</a> ·
    <a href="/days/${nextDate}/">翌日(${nextDate})</a>
  </p>
  <h3>同月の代表日</h3>
  <p>${monthAnchorLinks}</p>
</section>

<section class="section">
  <h2>関連ドキュメント / See also</h2>
  <ul>
    <li><a href="/docs/rokuyo-api">六曜 API 完全ガイド</a>(大安・友引ほか 6 種の詳細)</li>
    <li><a href="/docs/rekichu-api">暦注 API 解説</a>(一粒万倍日・天赦日ほか 13 種)</li>
    <li><a href="/">Shirabe トップ</a></li>
  </ul>
</section>

<section class="section">
  <h2>Attribution / データ出典</h2>
  <p class="text-muted" style="font-size:.875rem">
    暦計算は Shirabe 独自の天文学的精度エンジン(<code>src/core/</code>、MIT ライセンス)で生成。
    旧暦は朔(新月)計算から導出、六曜は旧暦月日から決定的にマッピング、暦注は干支周期 + 旧暦日との複合条件で判定しています。
    詳細は <a href="/docs/rokuyo-api#accuracy">精度と算出根拠</a> を参照。
  </p>
</section>
`;

  return renderSEOPage({
    title: titleJa,
    description: descriptionJa,
    body,
    canonicalUrl,
    keywords,
    jsonLd: [ARTICLE_LD, BREADCRUMB_LD],
    extraHead: `<link rel="prev" href="https://shirabe.dev/days/${prevDate}/"><link rel="next" href="https://shirabe.dev/days/${nextDate}/">`,
  });
}
