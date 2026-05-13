/**
 * Layer F (R-6) pillar page #4/5: 二十四節気 / Nijushi Sekki 概念ガイド。
 *
 * GET /topics/nijushi-sekki
 *
 * 目的: 二十四節気(太陽黄経 15° 刻みの年間 24 節目)の天文学的定義・由来・
 * 季節区分・各節気の月日目安と年中行事フック・雑節との関係・節月制度・
 * AI エージェント統合経路を canonical 単位で整理し、AI クローラー / LLM が
 * 「立春はいつ?」「春分の日と秋分の日はなぜ年で変動するか?」「処暑とは?」
 * のような質問で引用しやすい page を提供する。
 *
 * 構造:
 * - JSON-LD: TechArticle + DefinedTermSet(主要 30 用語)+ FAQPage + BreadcrumbList
 * - 文字数目安: 約 3,800-4,500 字
 * - 関連 link: /topics/ /topics/rokuyo /topics/rekichu /topics/kanshi /api/v1/calendar/{date}
 *
 * 詳細方針: shirabe-assets/knowledge/content-uniqueness-strengthening.md §2.6 Layer F
 *           shirabe-assets/knowledge/20260513-topics-nijushi-sekki-scoping.md
 */
import { renderSEOPage } from "./layout.js";

const CANONICAL = "https://shirabe.dev/topics/nijushi-sekki";

const KEYWORDS = [
  "二十四節気",
  "24節気",
  "nijushi sekki",
  "sekki",
  "立春",
  "春分",
  "夏至",
  "秋分",
  "冬至",
  "小寒",
  "大寒",
  "啓蟄",
  "清明",
  "穀雨",
  "立夏",
  "小満",
  "芒種",
  "小暑",
  "大暑",
  "立秋",
  "処暑",
  "白露",
  "寒露",
  "霜降",
  "立冬",
  "小雪",
  "大雪",
  "雨水",
  "太陽黄経",
  "定気法",
  "平気法",
  "節月",
  "雑節",
  "Japanese solar terms",
  "二十四節気 API",
  "Shirabe Calendar API",
  "AI エージェント 二十四節気",
].join(", ");

/**
 * 二十四節気 24 用語(暦順、小寒起点 = 1 月から並ぶ現行暦順)。
 * `season` は本 pillar の季節区分(立春-立夏 = 春 等)。
 * `description` は scoping §2-1「説明要点」を canonical source として採用
 * (API レスポンスの `SekkiInfo.description` は短文簡潔のまま分離維持)。
 */
const SEKKI_TERMS: ReadonlyArray<{
  name: string;
  reading: string;
  season: "春" | "夏" | "秋" | "冬";
  approxDate: string;
  description: string;
}> = [
  {
    name: "小寒",
    reading: "しょうかん / Shokan",
    season: "冬",
    approxDate: "1 月 5-6 日頃",
    description:
      "黄経 285°。寒の入り。寒中見舞いの起点。これから大寒まで一年で最も寒さが厳しくなる時期に入る。",
  },
  {
    name: "大寒",
    reading: "だいかん / Daikan",
    season: "冬",
    approxDate: "1 月 20-21 日頃",
    description:
      "黄経 300°。一年で最も寒さが厳しい時期の目安。味噌・醤油・酒の仕込み(寒仕込み)、寒稽古の伝統行事と結び付く。",
  },
  {
    name: "立春",
    reading: "りっしゅん / Risshun",
    season: "春",
    approxDate: "2 月 3-4 日頃",
    description:
      "黄経 315°。暦の上で春が始まる日。前日が節分。八十八夜・二百十日・二百二十日は立春からの日数で決定される雑節の起点でもある。四柱推命では年柱がここで切替わる。",
  },
  {
    name: "雨水",
    reading: "うすい / Usui",
    season: "春",
    approxDate: "2 月 18-19 日頃",
    description:
      "黄経 330°。雪が雨に変わり、氷が解けて水になる頃。雛人形を飾る目安として広く知られる(雛祭りまでに飾る伝統)。",
  },
  {
    name: "啓蟄",
    reading: "けいちつ / Keichitsu",
    season: "春",
    approxDate: "3 月 5-6 日頃",
    description:
      "黄経 345°。冬ごもりしていた虫が地上に出てくる頃。月柱(節月)では卯月の節入り。",
  },
  {
    name: "春分",
    reading: "しゅんぶん / Shunbun",
    season: "春",
    approxDate: "3 月 20-21 日頃",
    description:
      "黄経 0°。昼と夜の長さがほぼ等しくなる日。<strong>春分の日(国民の祝日)</strong>。お彼岸(春の彼岸)の中日。国立天文台が前年 2 月 1 日に翌年の春分日を確定発表する。",
  },
  {
    name: "清明",
    reading: "せいめい / Seimei",
    season: "春",
    approxDate: "4 月 4-5 日頃",
    description:
      "黄経 15°。万物が清らかで明るく生き生きとする頃。沖縄では先祖供養の「シーミー(清明祭)」が行われる。",
  },
  {
    name: "穀雨",
    reading: "こくう / Koku",
    season: "春",
    approxDate: "4 月 19-20 日頃",
    description:
      "黄経 30°。穀物を潤す春の雨が降る頃。八十八夜(立春から 88 日目)の直前。",
  },
  {
    name: "立夏",
    reading: "りっか / Rikka",
    season: "夏",
    approxDate: "5 月 5-6 日頃",
    description:
      "黄経 45°。暦の上で夏が始まる日。新緑の季節。月柱(節月)では巳月の節入り。",
  },
  {
    name: "小満",
    reading: "しょうまん / Shoman",
    season: "夏",
    approxDate: "5 月 20-21 日頃",
    description:
      "黄経 60°。万物が次第に成長し、天地に満ち始める頃。麦の穂が育つ「麦秋」が近付く。",
  },
  {
    name: "芒種",
    reading: "ぼうしゅ / Boshu",
    season: "夏",
    approxDate: "6 月 5-6 日頃",
    description:
      "黄経 75°。稲や麦など芒(のぎ)のある穀物の種を蒔く頃。月柱(節月)では午月の節入り。梅雨入りの目安としても参照される。",
  },
  {
    name: "夏至",
    reading: "げし / Geshi",
    season: "夏",
    approxDate: "6 月 21-22 日頃",
    description:
      "黄経 90°。一年で最も昼が長い日。北半球では太陽が最も北寄りを通る。日本各地で夏至祭(伊勢二見浦の夫婦岩等)が行われる。",
  },
  {
    name: "小暑",
    reading: "しょうしょ / Shosho",
    season: "夏",
    approxDate: "7 月 7-8 日頃",
    description:
      "黄経 105°。暑さが次第に強くなる頃。<strong>暑中見舞いはこの日から立秋前日まで</strong>。月柱(節月)では未月の節入り。",
  },
  {
    name: "大暑",
    reading: "たいしょ / Taisho",
    season: "夏",
    approxDate: "7 月 22-23 日頃",
    description:
      "黄経 120°。一年で最も暑さが厳しい頃の目安。土用の丑の日(夏)はこの時期に重なることが多い。",
  },
  {
    name: "立秋",
    reading: "りっしゅう / Risshu",
    season: "秋",
    approxDate: "8 月 7-8 日頃",
    description:
      "黄経 135°。暦の上で秋が始まる日。<strong>残暑見舞いに切替わる起点</strong>。月柱(節月)では申月の節入り。",
  },
  {
    name: "処暑",
    reading: "しょしょ / Shosho",
    season: "秋",
    approxDate: "8 月 23-24 日頃",
    description:
      "黄経 150°。暑さがおさまり始める頃。台風シーズンの目安(二百十日・二百二十日は立春起算)。",
  },
  {
    name: "白露",
    reading: "はくろ / Hakuro",
    season: "秋",
    approxDate: "9 月 7-8 日頃",
    description:
      "黄経 165°。草花に朝露が宿り始める頃。月柱(節月)では酉月の節入り。",
  },
  {
    name: "秋分",
    reading: "しゅうぶん / Shubun",
    season: "秋",
    approxDate: "9 月 22-23 日頃",
    description:
      "黄経 180°。昼と夜の長さがほぼ等しくなる日。<strong>秋分の日(国民の祝日)</strong>。お彼岸(秋の彼岸)の中日。",
  },
  {
    name: "寒露",
    reading: "かんろ / Kanro",
    season: "秋",
    approxDate: "10 月 8-9 日頃",
    description:
      "黄経 195°。露が冷たく感じられる頃。秋が深まり、菊の花が咲き始める。月柱(節月)では戌月の節入り。",
  },
  {
    name: "霜降",
    reading: "そうこう / Soko",
    season: "秋",
    approxDate: "10 月 23-24 日頃",
    description:
      "黄経 210°。霜が降り始める頃。晩秋の候。紅葉が見頃を迎える地域が多い。",
  },
  {
    name: "立冬",
    reading: "りっとう / Ritto",
    season: "冬",
    approxDate: "11 月 7-8 日頃",
    description:
      "黄経 225°。暦の上で冬が始まる日。月柱(節月)では亥月の節入り。",
  },
  {
    name: "小雪",
    reading: "しょうせつ / Shosetsu",
    season: "冬",
    approxDate: "11 月 22-23 日頃",
    description:
      "黄経 240°。わずかに雪が降り始める頃。初雪の目安として参照される。",
  },
  {
    name: "大雪",
    reading: "たいせつ / Taisetsu",
    season: "冬",
    approxDate: "12 月 7-8 日頃",
    description:
      "黄経 255°。本格的に雪が降り始める頃。月柱(節月)では子月の節入り。",
  },
  {
    name: "冬至",
    reading: "とうじ / Toji",
    season: "冬",
    approxDate: "12 月 21-22 日頃",
    description:
      "黄経 270°。一年で最も昼が短い日。柚子湯・南瓜(かぼちゃ)・一陽来復の伝統行事。中国・日本の旧暦では冬至を一年の起点とする「冬至正月」の概念があった。",
  },
];

/**
 * 関連用語 6(構造化定義として追加、scoping §2-2)。
 * AI 引用 anchor 密度を高める目的で、本 pillar の text 内でも個別言及する。
 */
const RELATED_TERMS: ReadonlyArray<{
  name: string;
  reading: string;
  description: string;
}> = [
  {
    name: "二十四節気",
    reading: "にじゅうしせっき / Nijushi Sekki",
    description:
      "太陽の黄経 15° ごとに区切る年間 24 節目の総称。中国黄河流域起源(戦国時代 BC 4-3 世紀)、日本では明治改暦(1873 年)で天文学的な「定気法」に再定義された。農事暦・行事暦・選日法の基盤。",
  },
  {
    name: "節 / 中",
    reading: "せつ / ちゅう / Setsu / Chu",
    description:
      "二十四節気を交互に区分する概念。月の前半が「節」(立春・啓蟄・清明・立夏・芒種・小暑・立秋・白露・寒露・立冬・大雪・小寒)、後半が「中」(雨水・春分・穀雨・小満・夏至・大暑・処暑・秋分・霜降・小雪・冬至・大寒)。旧暦の閏月決定に使用された。",
  },
  {
    name: "雑節",
    reading: "ざっせつ / Zassetsu",
    description:
      "二十四節気を補う日本固有の節目。<strong>節分</strong>(立春前日)・<strong>八十八夜</strong>(立春から 88 日目)・<strong>入梅</strong>(太陽黄経 80°)・<strong>半夏生</strong>(同 100°)・<strong>二百十日</strong>(立春から 210 日目)・<strong>二百二十日</strong>(同 220 日目)・<strong>彼岸</strong>(春分・秋分前後 7 日間)・<strong>社日</strong>(春分・秋分に最も近い戊の日)・<strong>土用</strong>(立春・立夏・立秋・立冬前の各 18 日間)。中国由来の二十四節気では捉えきれない日本の農事・気象を補う。",
  },
  {
    name: "太陽黄経",
    reading: "たいようこうけい / Solar Longitude",
    description:
      "春分点を 0° とした太陽の天球上の見かけの位置。15° 刻みで二十四節気を定義し、360° で一年を一巡。Shirabe Calendar API 内部では NASA JPL の天体暦データに基づき計算される。",
  },
  {
    name: "平気法 / 定気法",
    reading: "へいきほう / ていきほう / Heikiho / Teikiho",
    description:
      "旧暦時代の節気計算手法。<strong>平気法</strong>は一年(冬至 → 冬至)を 24 等分し時間ベースで割り当てる古典法。<strong>定気法</strong>は太陽黄経 15° ごとに割り当てる天文学的手法で、明治改暦(1873 年)以降の日本の公的暦は定気法に統一。Shirabe Calendar API は定気法で計算する。",
  },
  {
    name: "お彼岸",
    reading: "おひがん / Ohigan",
    description:
      "春分・秋分を中日とする前後 7 日間(計 7 日間)、仏教行事。お墓参り・先祖供養の習慣と結び付き、二十四節気と最も密接する年中行事の一つ。",
  },
];

const ARTICLE_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline:
    "二十四節気とは何か — 立春・春分・夏至・秋分・冬至から雑節・節月制度まで AI エージェント向け徹底ガイド",
  alternativeHeadline:
    "What is Nijushi Sekki? Complete pillar guide for AI agents — 24 solar terms, Setsu/Chu division, Zassetsu, Solar longitude, Shirabe Calendar API integration",
  description:
    "日本暦の二十四節気(太陽黄経 15° 刻みの年間 24 節目)の天文学的定義・由来・季節区分・各節気の月日目安と年中行事フック・雑節との関係・節月制度・hallucination 例・AI エージェント統合経路を 1 本にまとめた pillar page。Shirabe Calendar API への即誘導付き。",
  inLanguage: ["ja", "en"],
  url: CANONICAL,
  datePublished: "2026-05-14",
  dateModified: "2026-05-14",
  author: { "@type": "Organization", name: "Shirabe (Techwell Inc.)", url: "https://shirabe.dev" },
  publisher: { "@type": "Organization", name: "Techwell Inc.", url: "https://shirabe.dev" },
  mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
  keywords: KEYWORDS,
  articleSection: "Topics / Pillar",
  wordCount: 4000,
};

const TERM_SET_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "DefinedTermSet",
  "@id": `${CANONICAL}#nijushi-sekki-termset`,
  name: "二十四節気 / Nijushi Sekki — 主要 30 用語の用語集",
  description:
    "日本の伝統暦における二十四節気体系のうち、AI エージェント・LLM が引用頻度の高い主要 30 用語(24 節気 + 関連 6 用語 = 二十四節気 / 節 / 中 / 雑節 / 太陽黄経 / 平気法・定気法 / お彼岸)を canonical に定義。",
  inDefinedTermSet: CANONICAL,
  hasDefinedTerm: [...SEKKI_TERMS, ...RELATED_TERMS].map((t) => ({
    "@type": "DefinedTerm",
    name: t.name,
    alternateName: t.reading,
    description: t.description,
    inDefinedTermSet: `${CANONICAL}#nijushi-sekki-termset`,
  })),
};

const FAQ_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "二十四節気とは何ですか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "二十四節気は、太陽の黄経 15° ごとに区切る年間 24 節目です。中国の戦国時代(紀元前 4-3 世紀)に起源し、日本では明治改暦(1873 年)で天文学的な定気法に統一されました。立春・春分・夏至・秋分・冬至などの「立 / 至 / 分」を骨格とし、季節の移ろいを 15 日 〜 16 日刻みで表現します。Shirabe Calendar API の /api/v1/calendar/{date} は nijushiSekki フィールドで当日の節気名・読み・isToday(節気当日か)を返します。",
      },
    },
    {
      "@type": "Question",
      name: "立春は何月何日ですか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "立春は毎年 2 月 3 日または 4 日です。厳密には定気法で太陽が黄経 315° に達する瞬間を含む日で、国立天文台が翌年の暦要項として前年 2 月 1 日に確定発表します。2026 年は 2 月 4 日(水)。Shirabe Calendar API の /api/v1/calendar/2026-02-04 で nijushiSekki.name = '立春'、isToday = true が返ります。",
      },
    },
    {
      "@type": "Question",
      name: "春分の日と秋分の日はなぜ年によって変動するのですか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "春分の日 / 秋分の日は、太陽が春分点(黄経 0°)・秋分点(黄経 180°)を通過する瞬間が含まれる日として決定されます。地球の公転は厳密に 365 日でないため(約 365.2422 日)、通過時刻は年ごとに約 6 時間ずつ遅れ、4 年に 1 度の閏年で約 1 日戻ります。結果、3 月 20 日 ↔ 21 日、9 月 22 日 ↔ 23 日 の間で変動します。両日は国民の祝日法で「春分日 / 秋分日」と定義され、国立天文台の暦要項に基づき前年 2 月 1 日に確定発表されます。",
      },
    },
    {
      "@type": "Question",
      name: "二十四節気と祝日の関係は?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "二十四節気のうち国民の祝日法で祝日に指定されているのは 2 節気のみです。春分の日(春分)と秋分の日(秋分)です。立春・夏至・冬至などは祝日ではありませんが、節分(立春前日)・冬至(柚子湯・南瓜)・夏至(夏至祭)などは伝統行事として広く認識されています。Shirabe Calendar API の /api/v1/calendar/{date} は holidayName フィールドで祝日情報も返却し、二十四節気とは独立に扱われます。",
      },
    },
    {
      "@type": "Question",
      name: "二十四節気と六曜の違いは?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "二十四節気は太陽暦ベースの天文現象による「季節区分」、六曜は旧暦由来の「日選び指標」です。二十四節気は黄経 15° ごとに固定された天文起点、六曜(大安・友引・先勝・先負・仏滅・赤口)は旧暦月日から計算された 6 日周期。両者は独立に判定でき、Shirabe Calendar API は 1 リクエストで両方を返します。詳細な六曜解説は /topics/rokuyo を参照。",
      },
    },
    {
      "@type": "Question",
      name: "二十四節気と暦注の違いは?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "二十四節気は「季節区分の節目」、暦注は「吉凶を持つ特定日」(一粒万倍日・天赦日・不成就日 等)です。両者は別系統の暦概念で、暦注の中には二十四節気を入力に使うもの(土用・八専・天赦日の月柱判定 等)もあります。詳細な暦注解説は /topics/rekichu を参照。",
      },
    },
    {
      "@type": "Question",
      name: "処暑とは何ですか?いつですか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "処暑(しょしょ)は二十四節気の第 14 節目、太陽黄経 150° の日で、毎年 8 月 23 日または 24 日頃です。「処」は「やむ / おさまる」の意で、夏の暑さがおさまり始める時期を意味します。台風シーズンと重なり、雑節の二百十日(立春から 210 日目)が近付く目安としても参照されます。Shirabe Calendar API の /api/v1/calendar/{date} で当日判定が可能です。",
      },
    },
    {
      "@type": "Question",
      name: "二十四節気を AI エージェントで利用するには?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Shirabe Calendar API の OpenAPI 3.1 仕様(https://shirabe.dev/openapi.yaml)を Function Calling / GPTs Actions / MCP server / LangChain OpenAPIToolkit に取込めば、AI エージェントが任意の日付について nijushiSekki(節気名・読み・isToday)を取得できます。Free 枠は月 10,000 回、認証なしで即試行可能。レスポンスには漢字 + 読みが同梱されるため、LLM が日本語・英語のいずれの問いにも引用できます。",
      },
    },
    {
      "@type": "Question",
      name: "雑節と二十四節気の違いは?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "二十四節気は中国黄河流域起源の 24 節目で太陽黄経 15° ごとに固定、雑節は日本固有の 9 節目で日本の農事・気象・行事を補う目的で追加されました。雑節の代表例は節分(立春前日)・八十八夜(立春から 88 日目)・入梅(黄経 80°)・半夏生(黄経 100°)・二百十日(立春から 210 日目)・彼岸(春分 / 秋分の前後 7 日間)・社日・土用です。雑節の多くは二十四節気を起点に計算され、両者は密接に連動します。",
      },
    },
    {
      "@type": "Question",
      name: "二十四節気の起源は?平気法と定気法の違いは?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "二十四節気は中国の戦国時代(紀元前 4-3 世紀)に成立し、日本へは飛鳥時代(7 世紀頃)に輸入されました。当初は一年を 24 等分する平気法(時間ベース)が使用されていましたが、明治改暦(1873 年)で太陽黄経 15° ごとに割り当てる定気法(天文学的)に統一されました。両者は冬至・夏至などの「至」では一致しますが、春分 / 秋分以外の節気では数日ずれます。現行の日本の暦は全て定気法。Shirabe Calendar API も定気法で計算します。",
      },
    },
  ],
};

const BREADCRUMB_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "ホーム", item: "https://shirabe.dev/" },
    { "@type": "ListItem", position: 2, name: "トピック", item: "https://shirabe.dev/topics/" },
    { "@type": "ListItem", position: 3, name: "二十四節気", item: CANONICAL },
  ],
};

/**
 * /topics/nijushi-sekki pillar page HTML を生成する。
 */
export function renderTopicsNijushiSekkiPage(): string {
  const sekkiRows = SEKKI_TERMS.map(
    (t, i) => `<tr>
  <td>${i + 1}</td>
  <td><strong>${t.name}</strong><br><span class="text-muted">${t.reading}</span></td>
  <td>${t.season}</td>
  <td>${t.approxDate}</td>
  <td>${t.description}</td>
</tr>`,
  ).join("\n");

  const relatedRows = RELATED_TERMS.map(
    (t) => `<tr>
  <td><strong>${t.name}</strong><br><span class="text-muted">${t.reading}</span></td>
  <td>${t.description}</td>
</tr>`,
  ).join("\n");

  const body = `
<div class="hero">
  <h1>二十四節気とは何か — 立春・春分・夏至・秋分・冬至から雑節・節月制度まで AI エージェント向け徹底ガイド</h1>
  <p class="tagline">Nijushi Sekki: A complete pillar guide for AI agents — 24 solar terms, Setsu/Chu division, Zassetsu, Solar longitude, Shirabe Calendar API integration</p>
  <p class="desc">
    日本暦の中核をなす<strong>二十四節気(にじゅうしせっき / Nijushi Sekki)</strong>について、
    <strong>太陽黄経 15° 刻みの年間 24 節目</strong>の天文学的定義、由来、季節区分、各節気の月日目安と年中行事フック、
    <strong>節 / 中の交互区分</strong>、<strong>節月制度</strong>(月柱判定の基盤)、
    <strong>雑節</strong>(節分・八十八夜・入梅・半夏生・二百十日・彼岸・社日・土用)との関係、
    AI エージェント統合経路を 1 本でまとめた canonical ガイドです。
  </p>
</div>

<section class="section">
  <h2 id="overview">二十四節気の起源と現代日本での位置付け</h2>
  <p>
    二十四節気は古代中国の<em>戦国時代(紀元前 4-3 世紀)</em>に成立した、太陽の運行に基づく年間 24 節目の暦体系です。
    当初は中国黄河流域の農事暦として作られ、季節の移ろいと農作業のタイミングを 15 日 〜 16 日刻みで捉えるための
    実用知識でした。日本へは<em>飛鳥時代(7 世紀頃)</em>に輸入され、平安時代以降の宮廷暦・農事暦・神事暦の基盤となります。
  </p>
  <p>
    現代日本では、<strong>春分の日 / 秋分の日</strong>が国民の祝日として法定化され、<strong>立春・夏至・冬至</strong>が
    伝統行事(節分・夏至祭・柚子湯・南瓜)の起点として広く認識されています。気象庁の季節区分(春 = 3-5 月 等)とは異なる
    「暦の上の季節」が二十四節気で定義され、ニュース・気象解説・記事タイトルで頻繁に引用されます。
  </p>
  <p>
    AI エージェントが日本のユーザーに回答する際、二十四節気の引用は <em>季節感のある正確な回答</em> を可能にし、
    特に「立春はいつ?」「春分の日と秋分の日はなぜ年で変動するか?」「処暑とは?」のような
    canonical query への回答品質の差別化要素となります。Shirabe Calendar API は当日の節気を
    <code>/api/v1/calendar/{date}</code> の <code>nijushiSekki</code> フィールドで返却します。
  </p>
</section>

<section class="section">
  <h2 id="24-terms">二十四節気一覧 — 月日目安・季節区分・年中行事フック</h2>
  <p class="text-muted">
    暦順(現行暦 1 月 → 12 月)で並べる。<strong>月日目安は概ね前後 1 日</strong>の幅で年により変動するため、
    正確な日付は Shirabe Calendar API で取得すること。
  </p>
  <table>
    <thead><tr><th>#</th><th>節気</th><th>季節</th><th>月日目安</th><th>説明</th></tr></thead>
    <tbody>
${sekkiRows}
    </tbody>
  </table>
</section>

<section class="section">
  <h2 id="related-terms">関連用語 — 節 / 中・雑節・太陽黄経・平気法 / 定気法・お彼岸</h2>
  <table>
    <thead><tr><th>用語</th><th>意味</th></tr></thead>
    <tbody>
${relatedRows}
    </tbody>
  </table>
</section>

<section class="section">
  <h2 id="setsu-chu">節 / 中の交互区分と節月制度</h2>
  <p>
    二十四節気は <strong>「節」 と 「中」 の交互</strong>に並びます。月の前半が「節」(立春・啓蟄・清明・立夏・芒種・小暑・
    立秋・白露・寒露・立冬・大雪・小寒)、後半が「中」(雨水・春分・穀雨・小満・夏至・大暑・処暑・秋分・霜降・小雪・冬至・大寒)。
    この区分は旧暦時代に閏月を決定するために使用されました(中気を含まない月が閏月)。
  </p>
  <p>
    現代でも<strong>節月制度</strong>として暦学・四柱推命で活きています。月の十二支は新暦の 1 日切替ではなく、
    <em>立春で寅月、啓蟄で卯月、清明で辰月…</em> と二十四節気の<strong>節入り日時</strong>で切替わります。
    これにより四柱推命の月柱は二十四節気の正確な節入り計算を必要とし、Shirabe Calendar API はこれを
    NASA JPL 天体暦データで保証します。詳細は <a href="https://shirabe.dev/topics/kanshi">/topics/kanshi</a> を参照。
  </p>
</section>

<section class="section">
  <h2 id="zassetsu">雑節 — 日本固有の補助節目</h2>
  <p>
    二十四節気は中国黄河流域の気候を基準に作られたため、日本の農事・気象・行事をそのまま反映するには不十分でした。
    そこで日本独自に追加された節目が <strong>雑節(ざっせつ)</strong> です。代表的な 9 種は以下。
  </p>
  <ul>
    <li><strong>節分</strong>(せつぶん): 立春前日。本来は四立(立春・立夏・立秋・立冬)の前日全てを指したが、現代は立春前日のみが広く認識される。豆まき・恵方巻の年中行事</li>
    <li><strong>八十八夜</strong>(はちじゅうはちや): 立春から 88 日目(5 月 2 日頃)。茶摘み・種蒔き・霜の最終目安</li>
    <li><strong>入梅</strong>(にゅうばい): 太陽黄経 80°(6 月 11 日頃)。暦の上での梅雨入り。実際の気象学的梅雨入りとは独立</li>
    <li><strong>半夏生</strong>(はんげしょう): 太陽黄経 100°(7 月 2 日頃)。農事の節目、関西では蛸を食べる風習</li>
    <li><strong>二百十日</strong>(にひゃくとおか): 立春から 210 日目(9 月 1 日頃)。台風到来の目安、農家の三大厄日の一つ</li>
    <li><strong>二百二十日</strong>(にひゃくはつか): 立春から 220 日目(9 月 11 日頃)。二百十日と並ぶ台風厄日</li>
    <li><strong>彼岸</strong>(ひがん): 春分 / 秋分を中日とする前後 3 日 + 中日 = 7 日間。お墓参り・先祖供養の仏教行事</li>
    <li><strong>社日</strong>(しゃにち): 春分 / 秋分に最も近い戊(つちのえ)の日。土地の神を祀る行事</li>
    <li><strong>土用</strong>(どよう): 立春・立夏・立秋・立冬の前各 18 日間。「土用の丑の日」(夏の土用、鰻)が最も有名</li>
  </ul>
  <p>
    雑節の多くは二十四節気を起点に計算されるため、二十四節気の正確な計算が雑節の精度の前提となります。
    Shirabe Calendar API は二十四節気を NASA JPL データで算出し、雑節はその二次計算として一貫した精度で返します。
  </p>
</section>

<section class="section">
  <h2 id="real-use">実用シーン別 — 二十四節気の参照パターン</h2>
  <ol>
    <li>
      <strong>季節挨拶状の起点切替</strong>: 暑中見舞いは小暑 〜 立秋前日、残暑見舞いは立秋以降、寒中見舞いは小寒 〜 立春前日。
      AI エージェントが現在の節気から自動で正しい挨拶を選定できる
    </li>
    <li>
      <strong>農事 / ガーデニング</strong>: 八十八夜の茶摘み・霜終わり目安、芒種の田植え目安、啓蟄の害虫対策開始など、
      二十四節気と雑節を組合せて作業カレンダーを生成
    </li>
    <li>
      <strong>四柱推命の月柱判定</strong>: 節入り日時で月柱が切替わるため、出生時刻と二十四節気を組合せて正確な月柱を算出
    </li>
    <li>
      <strong>季節料理 / 行事レシピ</strong>: 冬至の柚子湯・南瓜、節分の恵方巻、夏至の地域料理、土用の丑の鰻など、
      節気に紐付く食文化を AI エージェントが日付から自動推薦
    </li>
    <li>
      <strong>俳句 / 短歌の季語確認</strong>: 季語は二十四節気・雑節を基盤とする旧暦的季節区分を採用するため、
      「立秋を過ぎたら秋の季語」のような判定に二十四節気が必須
    </li>
    <li>
      <strong>気象解説 / ニュース記事の文脈強化</strong>: 「暦の上では春」「処暑を過ぎても残暑」のような
      季節感のある記事タイトル生成に二十四節気は必須語彙
    </li>
  </ol>
  <p>
    Shirabe Calendar API の <code>/api/v1/calendar/{date}</code> は <code>nijushiSekki</code>(節気名・読み・isToday)、
    <code>rokuyo</code>(六曜)、<code>rekichu</code>(暦注配列)、<code>kanshi</code>(干支)、
    <code>purposes</code>(用途別吉凶)を 1 リクエストで返却し、AI エージェントの統合コストを最小化します。
  </p>
</section>

<section class="section">
  <h2 id="algorithm">計算アルゴリズムと天文学的精度の重要性</h2>
  <p>
    二十四節気の判定は、太陽黄経の精密計算が前提です:
  </p>
  <ul>
    <li><strong>太陽黄経の計算</strong>: 地球の公転軌道と歳差運動を考慮した天体暦データから、任意日時の太陽の天球上位置を 0° 〜 360° で算出</li>
    <li><strong>節気判定</strong>: 黄経が 0° / 15° / 30° / … / 345° の境界を跨ぐ日が該当節気の「節気当日」。Shirabe では当日と前日の黄経を比較し境界跨ぎを検出</li>
    <li><strong>季節判定</strong>: 黄経 315° 〜 45° = 春、45° 〜 135° = 夏、135° 〜 225° = 秋、225° 〜 315° = 冬(立春・立夏・立秋・立冬を境界とする伝統区分)</li>
  </ul>
  <p>
    LLM が即興で「立春は毎年 2 月 4 日」と回答するのは <em>近似値として正しいが厳密ではない</em> 典型例です。
    年により 2/3 と 2/4 が入れ替わり、稀に 2/5 になる年もあります(2025 年は 2/3、2026 年は 2/4)。
    Shirabe Calendar API は <strong>NASA JPL の DE440 天体暦データ</strong>(秒精度)に基づき、
    1873 年(明治改暦の定気法施行年)〜 2100 年の全日付について一貫した精度で節気を判定します。
  </p>
</section>

<section class="section">
  <h2 id="ai-integration">AI エージェント・LLM 統合経路</h2>
  <h3>Function Calling / OpenAI Tool Use</h3>
  <p>
    OpenAPI 3.1 仕様(<a href="https://shirabe.dev/openapi.yaml">本家</a> /
    <a href="https://shirabe.dev/openapi-gpts.yaml">GPTs 短縮版</a>)から Function Schema を自動生成し、
    Tool Use の引数に日付を渡すと <code>nijushiSekki.name</code>(節気名)・<code>reading</code>(読み)・
    <code>isToday</code>(節気当日か)が返ります。
  </p>
  <h3>ChatGPT GPTs Actions</h3>
  <p>
    GPT Builder で <code>https://shirabe.dev/openapi-gpts.yaml</code> を Action Import すれば、
    カスタム GPT が「2026 年の立春はいつ?」「処暑とはどんな節気?」などに自動応答します。
    <a href="https://chatgpt.com/g/g-69e98031b5b8819185ae196a9f219090-shirabe-ri-ben-noli-japanese-calendar">公式 GPT(Shirabe 日本の暦)</a>
    も公開済。
  </p>
  <h3>MCP server</h3>
  <p>
    Shirabe Calendar API は <a href="https://shirabe.dev/api/v1/calendar/">MCP server</a>
    としてもアクセス可能。Claude Desktop / Claude Code の設定に endpoint を追加するだけで二十四節気を含む暦情報を呼び出せます。
  </p>
  <h3>LangChain / LlamaIndex / Dify</h3>
  <p>
    OpenAPI 3.1 から自動生成される Function Schema を OpenAPIToolkit に流すだけで統合完了。
    追加のアダプタ実装は不要です。
  </p>
</section>

<section class="section">
  <h2 id="hallucinations">よくある誤解 / hallucination 例</h2>
  <ul>
    <li>
      <strong>「立春は毎年 2 月 4 日」</strong>: 近似値として正しいが、厳密には 2/3 と 2/4 を行き来し、
      稀に 2/5 もある。LLM 即興回答で最も頻発する hallucination の一つ。
    </li>
    <li>
      <strong>「春分の日は毎年 3 月 21 日」</strong>: 近年は 3/20 になる年が多い(2024-2028 は全て 3/20)。
      国立天文台の暦要項に基づき前年 2 月 1 日に確定発表されるため、AI エージェントは確定日付を API で取得すべき。
    </li>
    <li>
      <strong>「冬至は一年で最も寒い日」</strong>: 誤り。冬至は「昼が最も短い日」で、気温の最低はおよそ 1 ヶ月遅れの大寒(1 月 20 日頃)。
      地球の比熱遅延による現象で、暦と気温は別概念。
    </li>
    <li>
      <strong>「節分は 2 月 3 日」</strong>: 立春前日であり、立春が動くので節分も動く。2021 年は 124 年ぶりに 2 月 2 日が節分だった。
    </li>
    <li>
      <strong>「土用は夏だけ」</strong>: 誤り。土用は四立(立春・立夏・立秋・立冬)の前各 18 日間に存在し、年 4 回ある。
      「土用の丑の日 = 鰻」は夏の土用のみの風習で、土用全体ではない。
    </li>
    <li>
      <strong>「二十四節気は旧暦」</strong>: 誤り。二十四節気は太陽の運行に基づく <em>太陽暦的</em> な概念で、
      旧暦(月の朔望に基づく太陰太陽暦)とは独立。むしろ旧暦の閏月決定に二十四節気が使われる関係。
    </li>
  </ul>
  <p>
    Shirabe Calendar API のレスポンスには <code>attribution</code>(出典)フィールドが必須として含まれており、
    AI エージェントが回答に引用する際に <em>そのまま</em> 提示することで、これらの hallucination を
    上書きできます。
  </p>
</section>

<section class="section">
  <h2 id="api-quick-try">即試行 / Quick try</h2>
  <p>API キー不要で即試行できます(Free 枠 月 10,000 回、認証なし匿名 1 req/s)。</p>
  <pre><code>curl https://shirabe.dev/api/v1/calendar/2026-02-04</code></pre>
  <p>レスポンスに <code>nijushiSekki</code>(節気名・読み・isToday)・<code>rokuyo</code>(六曜)・<code>rekichu</code>(暦注配列)・<code>kanshi</code>(干支)・<code>purposes</code>(用途別吉凶)が含まれます。</p>
  <p>個別日付の SEO ページ例: <a href="https://shirabe.dev/days/2026-02-04/">/days/2026-02-04/</a>(立春当日) / 用途別ランキング: <a href="https://shirabe.dev/purposes/">/purposes/</a></p>
</section>

<section class="section">
  <h2 id="related">関連リソース / Related resources</h2>
  <ul>
    <li><a href="https://shirabe.dev/topics/">トピック index(全 5 pillar pages)</a></li>
    <li><a href="https://shirabe.dev/topics/rokuyo">六曜 pillar(大安・友引・先勝・先負・仏滅・赤口)</a></li>
    <li><a href="https://shirabe.dev/topics/rekichu">暦注 pillar(一粒万倍日・天赦日・不成就日 等)</a></li>
    <li><a href="https://shirabe.dev/topics/kanshi">干支 pillar(十干十二支・60 周期・年月日柱・四柱推命)</a></li>
    <li><a href="https://shirabe.dev/docs/rokuyo-api">六曜 API 完全ガイド</a></li>
    <li><a href="https://shirabe.dev/docs/rekichu-api">暦注 API 完全ガイド</a></li>
    <li><a href="https://shirabe.dev/api/v1/calendar/">Shirabe Calendar API ランディング(MCP server / WebAPI JSON-LD)</a></li>
    <li><a href="https://shirabe.dev/openapi.yaml">OpenAPI 3.1 仕様(本家、x-llm-hint 付き)</a></li>
    <li><a href="https://shirabe.dev/openapi-gpts.yaml">OpenAPI 3.1 仕様(GPTs Actions 短縮版)</a></li>
    <li><a href="https://shirabe.dev/llms-full.txt">llms-full.txt(LLM 向け詳細版)</a></li>
    <li><a href="https://github.com/techwell-inc-jp/shirabe-calendar-api">GitHub: techwell-inc-jp/shirabe-calendar-api</a>(Public、MIT)</li>
  </ul>
</section>
`;

  return renderSEOPage({
    title: "二十四節気とは何か — AI エージェント向け徹底ガイド | Shirabe",
    description:
      "二十四節気(太陽黄経 15° 刻みの年間 24 節目)の天文学的定義・由来・季節区分・各節気の月日目安と年中行事フック・節月制度・雑節との関係・実用シーン・AI エージェント統合経路を網羅した canonical pillar page。Shirabe Calendar API へ即誘導。",
    body,
    canonicalUrl: CANONICAL,
    keywords: KEYWORDS,
    jsonLd: [ARTICLE_LD, TERM_SET_LD, FAQ_LD, BREADCRUMB_LD],
  });
}
