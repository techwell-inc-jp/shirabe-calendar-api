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
import type { Category } from "../core/types.js";
import { CATEGORY_DISPLAY_NAME } from "../data/context-map.js";
import {
  PURPOSE_CATEGORIES,
  PURPOSES_MAX_YEAR,
  PURPOSES_MIN_YEAR,
} from "../data/purposes-map.js";
import { renderSEOPage } from "./layout.js";
import { getDayTier } from "../data/tier.js";

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
 * `/days/{date}/` の対応範囲(T-01 sitemap と一致)。
 */
const DAYS_MIN_YEAR = 1873;
const DAYS_MAX_YEAR = 2100;

/**
 * 指定日付が `/days/` の対応範囲内か判定する。
 */
function isInDaysRange(year: number, month: number, day: number): boolean {
  if (year < DAYS_MIN_YEAR || year > DAYS_MAX_YEAR) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

/**
 * Layer C(R-3): 同干支の日(60 日周期)の YYYY-MM-DD 配列を返す。
 *
 * 干支は 60 日周期のため、±60n 日シフトで必ず同干支になる。Tier 1 ページに
 * 同干支間の crawl path を追加し、AI クローラーの topical exploration を強化。
 *
 * 対応範囲(1873-2100)を超える日付はフィルタする。
 *
 * @returns 最大 5 件(範囲超過分は省略)、自日は含まない
 */
function kanshiCycleAnchors(year: number, month: number, day: number): string[] {
  const deltas = [-180, -120, -60, 60, 120];
  return deltas
    .map((d) => shiftDate(year, month, day, d))
    .filter((dateStr) => {
      const [y, m, dd] = dateStr.split("-").map((s) => parseInt(s, 10));
      return isInDaysRange(y, m, dd);
    });
}

/**
 * Layer C(R-3): 周年(同月同日)アンカーの YYYY-MM-DD 配列を返す。
 *
 * ±10 年 / ±100 年の同月同日へのリンクで、長期 crawl path + 「歴史上の今日」
 * narrative を構築。Google + AI 両方の topical signal 強化。
 *
 * 2/29(閏日)の場合、ターゲット年が平年なら 2/28 に丸める(暦的には妥当)。
 * 対応範囲外はフィルタ。
 *
 * @returns 最大 4 件、自日は含まない
 */
function anniversaryAnchors(year: number, month: number, day: number): string[] {
  const yearDeltas = [-100, -10, 10, 100];
  const out: string[] = [];
  for (const yd of yearDeltas) {
    const targetYear = year + yd;
    if (targetYear < DAYS_MIN_YEAR || targetYear > DAYS_MAX_YEAR) continue;
    let targetDay = day;
    const lastDay = daysInMonth(targetYear, month);
    if (targetDay > lastDay) targetDay = lastDay; // 2/29 → 2/28 など
    const monthStr = String(month).padStart(2, "0");
    const dayStr = String(targetDay).padStart(2, "0");
    out.push(`${targetYear}-${monthStr}-${dayStr}`);
  }
  return out;
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
 * 暦 API レスポンスの context キー(日本語表示名)から内部 Category enum に
 * 逆引きするためのマップ。
 */
const DISPLAY_NAME_TO_API_CATEGORY: ReadonlyMap<string, Category> = new Map(
  (Object.entries(CATEGORY_DISPLAY_NAME) as Array<[Category, string]>).map(
    ([cat, ja]) => [ja, cat]
  )
);

/**
 * この日のスコア上位 3 件の API カテゴリそれぞれについて、
 * T-02 用途別ページ(同月)へのリンクを生成する。
 *
 * year が T-02 対応範囲(2010-2034)外の場合は空配列を返す
 * (T-01 対応範囲は 1873-2100 と広いため、T-02 範囲外の年で表示しないようガードする)。
 */
function buildPurposeLinks(
  contextEntries: Array<[string, { score: number }]>,
  year: number,
  monthStr: string
): Array<{ href: string; label: string }> {
  if (year < PURPOSES_MIN_YEAR || year > PURPOSES_MAX_YEAR) return [];
  const ym = `${year}-${monthStr}`;
  const links: Array<{ href: string; label: string }> = [];
  const seenApiCats = new Set<string>();
  for (const [jaKey] of contextEntries) {
    const apiCat = DISPLAY_NAME_TO_API_CATEGORY.get(jaKey);
    if (!apiCat || seenApiCats.has(apiCat)) continue;
    seenApiCats.add(apiCat);
    const seoEntry = PURPOSE_CATEGORIES.find((p) => p.apiCategory === apiCat);
    if (!seoEntry) continue;
    links.push({
      href: `/purposes/${seoEntry.slug}/${ym}/`,
      label: `${year}年${parseInt(monthStr, 10)}月の${seoEntry.displayJa}に良い日`,
    });
    if (links.length >= 3) break;
  }
  return links;
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
  const tier = getDayTier(year);

  const canonicalUrl = `https://shirabe.dev/days/${date}/`;
  const prevDate = shiftDate(year, month, day, -1);
  const nextDate = shiftDate(year, month, day, 1);
  const monthAnchors = sameMonthAnchors(year, month, day);

  // Layer C (R-3) 内部リンク密度向上: Tier 1 のみ追加リンク
  // 同干支の日(60 日周期 × 5)+ 周年(同月同日 ±10年/±100年 × 4)= 最大 9 リンク
  // Tier 2/3 では追加せず thin content 判定リスクを回避(各 Tier の URL 数バランス)
  const kanshiAnchors = tier === 1 ? kanshiCycleAnchors(year, month, day) : [];
  const anniversaries = tier === 1 ? anniversaryAnchors(year, month, day) : [];

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

  // T-02 用途別月間ランキングへの誘導(対応範囲 2010-2034 のみ表示)
  const purposeLinks = buildPurposeLinks(contextEntries, year, monthStr);

  // Layer E (R-5) original narrative: Tier 1 のみ生成
  // 既存データ(rokuyo / rekichu / context 上位 3)から導出して thin content 緩和、
  // AI agents が引用しやすい context unit を提供。重い統計計算は行わない(都度 lookup 回避)。
  const narrativeTopThree = contextEntries.slice(0, 3).map(([cat, ctx]) => ({
    label: CATEGORY_LABEL_JA[cat] ?? cat,
    score: ctx.score,
    judgment: ctx.judgment,
    note: ctx.note,
  }));
  const rekichuPhrase =
    rekichu.length > 0
      ? `<strong>${rekichu.map((r) => r.name).join("・")}</strong>(${rekichu
          .map((r) => r.type)
          .join("・")})が重なる`
      : "暦注のない";
  const showNarrative = tier === 1;

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

  // JSON-LD: WebAPI(Tier 1+2: AI agents が Function Calling 候補として認識するよう構造化)
  // Tier 3(歴史日付・遠未来)は省略してページサイズ削減
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
              urlTemplate: `https://shirabe.dev/api/v1/calendar/${date}`,
              encodingType: "application/json",
              httpMethod: "GET",
            },
            name: `Get calendar info for ${date}`,
          },
        }
      : null;

  // JSON-LD: FAQPage(Tier 1 のみ: AI 引用 source として Q&A 構造化、動的生成)
  // Tier 2/3 は省略(同質 Q&A の大量生成で thin content 判定リスク回避)
  const weddingCtx = context["wedding_ceremony"] ?? context["marriage_registration"];
  const FAQ_LD: Record<string, unknown> | null =
    tier === 1
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "@id": `${canonicalUrl}#faq`,
          mainEntity: [
            {
              "@type": "Question",
              name: `${year}年${month}月${day}日の六曜は何ですか?`,
              acceptedAnswer: {
                "@type": "Answer",
                text: `${year}年${month}月${day}日(${day_of_week.ja})の六曜は「${rokuyo.name}」です。${rokuyo.description}`,
              },
            },
            {
              "@type": "Question",
              name: `${year}年${month}月${day}日は結婚式に良い日ですか?`,
              acceptedAnswer: {
                "@type": "Answer",
                text: weddingCtx
                  ? `${year}年${month}月${day}日の結婚式吉凶判定は「${weddingCtx.judgment}」(スコア ${weddingCtx.score}/10)です。${weddingCtx.note}`
                  : `${year}年${month}月${day}日は${rokuyo.name}です。六曜と暦注を組み合わせた用途別判定は Shirabe API でご確認ください。`,
              },
            },
            ...(rekichu.length > 0
              ? [
                  {
                    "@type": "Question",
                    name: `${year}年${month}月${day}日はどんな暦注がありますか?`,
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: `${year}年${month}月${day}日の暦注: ${rekichu.map((r) => `${r.name}(${r.type})`).join("・")}。${rekichu[0].description}`,
                    },
                  },
                ]
              : []),
          ],
        }
      : null;

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

${
  showNarrative && narrativeTopThree.length >= 3
    ? `
<section class="section">
  <h2>この日の特徴 / Day overview</h2>
  <p>
    ${year}年${month}月${day}日(${day_of_week.ja})は<strong>${rokuyo.name}</strong>(${rokuyo.reading})と${rekichuPhrase}日です。${rokuyo.description}${
        rekichu.length > 0
          ? rekichu.map((r) => `${r.name}は${r.description}`).join(" ")
          : ""
      }
  </p>
  <p>
    用途別判定では最も優位な 3 観点は次のとおり:
    <strong>${narrativeTopThree[0].label}</strong>(スコア ${narrativeTopThree[0].score}/10、${narrativeTopThree[0].judgment})、
    <strong>${narrativeTopThree[1].label}</strong>(スコア ${narrativeTopThree[1].score}/10、${narrativeTopThree[1].judgment})、
    <strong>${narrativeTopThree[2].label}</strong>(スコア ${narrativeTopThree[2].score}/10、${narrativeTopThree[2].judgment})。
    これらは六曜・暦注・干支(${kanshi.full})の組合せ scoring に基づきます。詳細は API レスポンスの <code>context</code> フィールドで確認できます。
  </p>
</section>
`
    : ""
}

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

${
  purposeLinks.length > 0
    ? `
<section class="section">
  <h2>${year}年${month}月の用途別ランキング / Purpose-specific monthly rankings</h2>
  <p>この日が含まれる月の上位 10 日ランキングを用途別に確認できます:</p>
  <ul>
    ${purposeLinks.map((l) => `<li><a href="${l.href}">${l.label}</a></li>`).join("\n    ")}
  </ul>
  <p class="text-muted" style="font-size:.8125rem">
    全 ${PURPOSE_CATEGORIES.length} 用途を見るには <a href="/purposes/">用途別吉日ランキング 一覧</a> を参照。
  </p>
</section>
`
    : ""
}

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
${
  kanshiAnchors.length > 0
    ? `  <h3>同干支の日(60 日周期)/ Same kanshi (60-day cycle)</h3>
  <p class="text-muted" style="font-size:.875rem">
    干支は 60 日周期で循環します。同じ <strong>${kanshi.full}</strong>(${kanshi.junishi_animal.ja})の日:
  </p>
  <p>${kanshiAnchors
    .map((d) => {
      const [yy, mm, dd] = d.split("-");
      return `<a href="/days/${d}/">${parseInt(yy, 10)}年${parseInt(mm, 10)}月${parseInt(dd, 10)}日</a>`;
    })
    .join(" · ")}</p>
`
    : ""
}${
    anniversaries.length > 0
      ? `  <h3>歴史上の同じ日 / Anniversaries (same month-day)</h3>
  <p class="text-muted" style="font-size:.875rem">
    ${month}月${day}日の他年(±10年 / ±100年)の暦情報:
  </p>
  <p>${anniversaries
    .map((d) => {
      const [yy, mm, dd] = d.split("-");
      return `<a href="/days/${d}/">${parseInt(yy, 10)}年${parseInt(mm, 10)}月${parseInt(dd, 10)}日</a>`;
    })
    .join(" · ")}</p>
`
      : ""
  }</section>

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
    jsonLd: [
      ARTICLE_LD,
      BREADCRUMB_LD,
      ...(WEBAPI_LD ? [WEBAPI_LD] : []),
      ...(FAQ_LD ? [FAQ_LD] : []),
    ],
    extraHead: `<link rel="prev" href="https://shirabe.dev/days/${prevDate}/"><link rel="next" href="https://shirabe.dev/days/${nextDate}/">`,
  });
}
