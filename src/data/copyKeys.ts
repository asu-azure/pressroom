/**
 * Every editable line on /asu and the homepage artist teaser.
 *
 * The REGISTRY lives in code; only OVERRIDES live in the `site_copy` table.
 * That split is deliberate:
 *
 *  - The Studio form is generated from this file, so its sections always appear
 *    in the page's own visual order and the author edits "Hero → Status line",
 *    never a raw key.
 *  - Defaults ship with the build, so the page cannot render blank — an empty
 *    table, a failed fetch and a fresh install all look the same: complete.
 *  - Adding a line later is one entry here, with no migration.
 *
 * The defaults are carried over verbatim from the retired asu-art one-pager
 * (its `dict` in src/pages/index.astro), which was already written in all three
 * languages. Do not rewrite them casually — they are the site's voice.
 *
 * `type: 'rich'` fields are edited with RichTextEditor and may carry the
 * gradient highlight spans (`<span class="hl hl--g-blue">`). The sanitizer
 * allows exactly those classes on a span — see ALLOWED_SPAN_CLASSES in
 * lib/richtext.ts. Everything else is a plain line.
 */
import type { Lang } from '../lib/lang';

/**
 * Which page a section or scene slot actually appears on.
 *
 * This exists because the six acts moved to /lookbook while their copy stayed
 * in this registry — so the Studio was showing the author six sections with no
 * way to tell they were no longer part of the portfolio page. Every section and
 * every scene slot declares its page, and both Studio tabs group by it.
 *
 * ⚠ A new section or slot with no `page` will not appear in the Studio at all.
 */
export type PageId = 'asu' | 'home' | 'lookbook';

export interface PageGroup {
  id: PageId;
  /** Group heading in the Studio. */
  label: string;
  /** Where the author can go and look at the result. */
  href: string;
  /** One line on what this page is. */
  note: string;
}

/** Studio group order — the page the author edits most often comes first. */
export const PAGE_GROUPS: PageGroup[] = [
  {
    id: 'asu',
    label: 'YOUR PORTFOLIO',
    href: '/asu',
    note: 'The page people come to see your work. Short hero, gallery, about, contact.',
  },
  {
    id: 'home',
    label: 'THE SHELF',
    href: '/',
    note: 'The bookshelf everyone lands on, and the banner under it that leads here.',
  },
  {
    id: 'lookbook',
    label: 'LOOKBOOK',
    href: '/lookbook',
    note: 'The six cinematic acts, kept as a design reference. Not on your portfolio page.',
  },
];

export interface CopySection {
  id: string;
  /** Which page this lands on — see PAGE_GROUPS. */
  page: PageId;
  /** Heading in the Studio editor. */
  label: string;
  /** One line telling the author where on the page this lands. */
  note: string;
}

export interface CopyField {
  key: string;
  section: string;
  /** Human label — the author never sees `key`. */
  label: string;
  type: 'line' | 'rich';
  hint?: string;
  defaults: Record<Lang, string>;
}

/**
 * Grouped by page, and within each group in the order a visitor scrolls through
 * that page — so the Studio accordion reads like the visit. Keep it that way:
 * when a page's layout changes, this order has to move with it.
 */
export const SECTIONS: CopySection[] = [
  // --- /asu — short hero → gallery → about (story + craft + commissions) → contact
  { id: 'hero',    page: 'asu', label: 'Hero', note: 'The compact band at the top, above your artwork. Your name comes from PROFILE, not from here.' },
  { id: 'works',   page: 'asu', label: 'Selected work', note: 'Headings above the gallery. The artwork titles live in GALLERY.' },
  { id: 'story',   page: 'asu', label: 'Story', note: 'The top half of the About section. Your portrait comes from PROFILE.' },
  { id: 'craft',   page: 'asu', label: 'Craft', note: 'The lower half of the same About section — how you work, and the list under the lead.' },
  { id: 'comm',    page: 'asu', label: 'Commissions', note: 'Beside the craft list. Open/closed is a switch in PROFILE; these are the words around it.' },
  { id: 'contact', page: 'asu', label: 'Contact', note: 'The closing ink spread. Email and X come from PROFILE.' },

  // --- / — the shelf
  { id: 'teaser',  page: 'home', label: 'Homepage banner', note: 'The dark "Who is Asu Azure?" band on the shelf, below the book grid.' },
  { id: 'meta',    page: 'home', label: 'Page metadata', note: 'Browser tab and link previews. Not visible on the page itself.' },

  // --- /lookbook — the six acts, in their own scroll order
  { id: 'actFilm',    page: 'lookbook', label: 'Act I — Film', note: 'Letterboxed opening, four cycling photographs.' },
  { id: 'actScatter', page: 'lookbook', label: 'Act II — Scatter', note: 'Words that blow apart as you scroll.' },
  { id: 'actChar',    page: 'lookbook', label: 'Act III — Character', note: 'The double-exposure character study.' },
  { id: 'actSelect',  page: 'lookbook', label: 'Act IV — Selection', note: 'The sweeping selection-box interstitial.' },
  { id: 'act3d',      page: 'lookbook', label: 'Act V — 3D text', note: 'Perspective title over the dusk backdrop.' },
  { id: 'actGrid',    page: 'lookbook', label: 'Act VI — Grid finale', note: 'The wireframe stage that closes the lookbook.' },
];

export const COPY_FIELDS: CopyField[] = [
  // ---------------- Page metadata ----------------
  {
    key: 'meta.title', section: 'meta', label: 'Browser tab title', type: 'line',
    hint: 'Shown in the tab and in search results.',
    defaults: {
      en: 'Asu Azure — Illustration & Commissions',
      th: 'Asu Azure — ภาพประกอบ & รับงานคอมมิชชั่น',
      ja: 'Asu Azure — イラスト & コミッション',
    },
  },

  // ---------------- Homepage banner ----------------
  {
    key: 'teaser.kicker', section: 'teaser', label: 'Small label', type: 'line',
    hint: 'Uppercase mono, above the heading.',
    defaults: {
      en: 'THE ARTIST BEHIND THESE BOOKS',
      th: 'ผู้วาดหนังสือเหล่านี้',
      ja: 'この本たちを描いた人',
    },
  },
  {
    key: 'teaser.title', section: 'teaser', label: 'Heading', type: 'line',
    hint: 'The big serif question.',
    defaults: {
      en: 'Who is Asu Azure?',
      th: 'Asu Azure คือใคร?',
      ja: 'この本たちを描いたのは誰？',
    },
  },
  {
    key: 'teaser.lede', section: 'teaser', label: 'Short paragraph', type: 'line',
    hint: 'One or two sentences under the heading.',
    defaults: {
      en: 'The person who draws them: background, the gallery, and whether commissions are open.',
      th: 'คนที่วาดพวกเขา: เรื่องราว ผลงาน และสถานะการรับงาน',
      ja: 'プロフィール、イラスト作品集、依頼について。',
    },
  },
  {
    key: 'teaser.cta', section: 'teaser', label: 'Button text', type: 'line',
    hint: 'The link into /asu. The arrow is added automatically.',
    defaults: { en: 'MEET THE ARTIST', th: 'ทำความรู้จักผู้วาด', ja: 'プロフィールと作品集へ' },
  },

  // ---------------- Hero ----------------
  {
    key: 'hero.status', section: 'hero', label: 'Status line — commissions OPEN', type: 'line',
    hint: 'Shown when the commissions switch in PROFILE is on.',
    defaults: { en: 'COMMISSIONS · OPEN', th: 'รับงานคอมมิชชั่น · เปิดอยู่', ja: 'コミッション受付中' },
  },
  {
    key: 'hero.statusClosed', section: 'hero', label: 'Status line — commissions CLOSED', type: 'line',
    hint: 'Shown when that switch is off.',
    defaults: { en: 'COMMISSIONS · CLOSED', th: 'รับงานคอมมิชชั่น · ปิดชั่วคราว', ja: 'コミッション受付停止中' },
  },
  // `hero.title1` / `hero.title2` used to live here — a two-line display
  // headline carried over from the asu-art one-pager. The artist's own name
  // took that slot when the site was merged in, so no `data-i18n` ever rendered
  // them and the fields edited nothing. Removed rather than re-rendered; any
  // override already saved is ignored by loadCopy (see siteCopy.ts).
  {
    key: 'hero.sub', section: 'hero', label: 'Subtitle', type: 'line',
    hint: 'Uppercase mono, separated by · dots.',
    defaults: {
      en: 'DIGITAL ILLUSTRATION · CHARACTER ART · COMMISSIONS',
      th: 'ภาพประกอบดิจิทัล · ออกแบบตัวละคร · รับงานคอมมิชชั่น',
      ja: 'デジタルイラスト · キャラクターデザイン · コミッション',
    },
  },

  // ---------------- Act I — Film ----------------
  {
    key: 'act.filmTitle', section: 'actFilm', label: 'Title', type: 'line',
    defaults: { en: 'Beyond the door', th: 'เปิดประตูออกไป', ja: '扉の向こう' },
  },
  {
    key: 'act.filmSub', section: 'actFilm', label: 'Subtitle', type: 'line',
    defaults: {
      en: 'On the other side, a field opens — the summer that started everything.',
      th: 'อีกฟากหนึ่ง มีทุ่งดอกไม้รออยู่ — ฤดูร้อนที่เป็นจุดเริ่มต้นของทุกสิ่ง',
      ja: '向こう側に、野原がひらける。すべてが始まった夏へ。',
    },
  },

  // ---------------- Selected work ----------------
  {
    key: 'works.title', section: 'works', label: 'Heading', type: 'line',
    defaults: { en: 'Selected work', th: 'ผลงานคัดสรร', ja: '作品集' },
  },
  {
    key: 'works.sub', section: 'works', label: 'Subtitle', type: 'line',
    defaults: { en: 'SHOWCASE — TAP TO VIEW', th: 'แกลเลอรี — แตะเพื่อชมภาพเต็ม', ja: 'ギャラリー — タップで拡大' },
  },
  {
    // Wording corrected when the drag strip became a grid — "drag to explore"
    // described an interaction that no longer exists.
    key: 'works.archiveTag', section: 'works', label: 'Archive label', type: 'line',
    hint: 'The small line under the grid of every piece.',
    defaults: { en: 'ARCHIVE — TAP ANY PIECE', th: 'คลังผลงาน — แตะเพื่อชม', ja: 'アーカイブ — タップで拡大' },
  },
  {
    key: 'works.filterAll', section: 'works', label: 'Filter chip — "all"', type: 'line',
    hint: 'The other chips are your artwork mediums, edited in GALLERY.',
    defaults: { en: 'ALL', th: 'ทั้งหมด', ja: 'すべて' },
  },

  // ---------------- Act II — Scatter ----------------
  {
    key: 'act.scatterTitle', section: 'actScatter', label: 'Title', type: 'line',
    defaults: { en: 'Unsteady, still I go', th: 'หวั่นไหว แต่ยังก้าวต่อ', ja: '不安定な僕を' },
  },
  {
    // Replaced a hardcoded "SCROLL TO SCATTER" — a how-to that described the
    // interaction rather than the work, and ignored the language switcher.
    key: 'act.scatterSub', section: 'actScatter', label: 'Subtitle', type: 'line',
    defaults: {
      en: 'Every line starts as a scattered draft — I keep going until it holds.',
      th: 'ทุกเส้นเริ่มจากภาพร่างที่กระจัดกระจาย — วาดต่อไปจนกว่ามันจะอยู่ตัว',
      ja: 'どの線も、散らかった下描きから始まる。形になるまで描きつづける。',
    },
  },

  // ---------------- Story ----------------
  {
    key: 'story.tag', section: 'story', label: 'Small label', type: 'line',
    defaults: { en: 'BACKSTORY', th: 'เรื่องราว', ja: 'バックストーリー' },
  },
  {
    key: 'story.title', section: 'story', label: 'Heading', type: 'line',
    defaults: { en: 'Where it starts', th: 'จุดเริ่มต้น', ja: 'はじまりの場所' },
  },
  {
    key: 'story.p1', section: 'story', label: 'First paragraph', type: 'rich',
    hint: 'Select any words and press Highlight for the cobalt gradient.',
    defaults: {
      en: 'I’m <span class="hl hl--g-blue">Asu Azure</span> — a digital illustrator from Thailand, telling stories one frame at a time. I grew up between languages, filling sketchbooks with the characters I wished I could meet.',
      th: 'ฉันคือ <span class="hl hl--g-blue">Asu Azure</span> — นักวาดภาพประกอบดิจิทัลจากประเทศไทย ที่เล่าเรื่องราวทีละเฟรม ฉันเติบโตมาท่ามกลางหลายภาษา เติมสมุดสเก็ตช์ด้วยตัวละครที่อยากพบเจอ',
      ja: '私は <span class="hl hl--g-blue">Asu Azure</span> — タイ出身のデジタルイラストレーター。一コマずつ物語を描いています。複数の言語のあいだで育ち、会いたかったキャラクターたちでスケッチブックを埋めてきました。',
    },
  },
  {
    key: 'story.p2', section: 'story', label: 'Second paragraph', type: 'rich',
    hint: 'Carried over from the old site as a draft — rewrite it in your own voice.',
    defaults: {
      en: 'Most of what I draw orbits one ongoing series, <em>“Beyond the Door — 5 Petals of Sunflowers”</em>: school hallways, quiet seas, and the small moments that decide who we become. Two boys, one summer, and a door that only opens if you dare to knock — I draw the panels between their words, the light they don’t notice, and the field waiting on the other side.',
      th: 'ผลงานส่วนใหญ่ของฉันหมุนรอบซีรีส์ <em>“เปิดประตูสู่ทุ่งทานตะวัน”</em>: ทางเดินในโรงเรียน ท้องทะเลอันเงียบสงบ และช่วงเวลาเล็ก ๆ ที่กำหนดว่าเราจะเป็นใคร เด็กชายสองคน ฤดูร้อนหนึ่งเดียว และประตูบานหนึ่งที่จะเปิดก็ต่อเมื่อกล้าเคาะ — ฉันวาดช่องว่างระหว่างคำพูดของพวกเขา แสงที่พวกเขาไม่ทันสังเกต และทุ่งดอกไม้ที่รออยู่อีกฟากของประตู',
      ja: '私が描くものの多くは、進行中のシリーズ <em>「扉の向こう、ひまわりの5枚の花びら」</em> を巡っています。学校の廊下、静かな海、そして私たちが何者になるかを決める小さな瞬間。ふたりの少年、ひとつの夏、ノックする勇気がなければ開かない扉 — 言葉と言葉のあいだ、本人たちが気づかない光、そして扉の向こうで待つひまわり畑を描いています。',
    },
  },

  // ---------------- Act III — Character ----------------
  {
    key: 'act.charTitle', section: 'actChar', label: 'Title', type: 'line',
    defaults: { en: 'The one I wanted to meet', th: 'คนที่อยากพบเจอ', ja: '会いたかった人' },
  },
  {
    key: 'act.charCap', section: 'actChar', label: 'Caption', type: 'line',
    defaults: {
      en: 'CHARACTER STUDY — from “Beyond the Door”',
      th: 'ภาพร่างตัวละคร — จากซีรีส์ “เปิดประตูสู่ทุ่งทานตะวัน”',
      ja: 'キャラクタースタディ — 「扉の向こう」より',
    },
  },

  // ---------------- Craft ----------------
  {
    key: 'craft.title', section: 'craft', label: 'Heading', type: 'line',
    defaults: { en: 'The craft', th: 'งานฝีมือ', ja: '制作について' },
  },
  {
    key: 'craft.lead', section: 'craft', label: 'Lead paragraph', type: 'rich',
    hint: 'Highlight works here too — the old site used cobalt on one word and amber on another.',
    defaults: {
      en: 'One instinct, drawn out: build <span class="hl hl--g-blue">characters</span> and the worlds they live in — then push the light until they feel <span class="hl hl--g-amber">alive.</span>',
      th: 'สัญชาตญาณเดียว ถ่ายทอดออกมา: สร้าง<span class="hl hl--g-blue">ตัวละคร</span>และโลกที่พวกเขาอยู่ — แล้วเล่นกับแสงจนรู้สึก<span class="hl hl--g-amber">มีชีวิต</span>',
      ja: 'ひとつの衝動を形に：<span class="hl hl--g-blue">キャラクター</span>と彼らの世界を作り、光を重ねて<span class="hl hl--g-amber">命</span>を吹き込む。',
    },
  },
  {
    key: 'craft.item1', section: 'craft', label: 'List item 1', type: 'line',
    defaults: { en: 'Clip Studio Paint · fully digital', th: 'Clip Studio Paint · ดิจิทัลทั้งหมด', ja: 'Clip Studio Paint · フルデジタル' },
  },
  {
    key: 'craft.item2', section: 'craft', label: 'List item 2', type: 'line',
    defaults: {
      en: 'Character design · illustration · cover art',
      th: 'ออกแบบตัวละคร · ภาพประกอบ · ภาพปก',
      ja: 'キャラクターデザイン · イラスト · 表紙',
    },
  },
  {
    key: 'craft.item3', section: 'craft', label: 'List item 3', type: 'line',
    defaults: { en: 'Manga · color & monochrome', th: 'มังงะ · สี & ขาวดำ', ja: 'マンガ · カラー & モノクロ' },
  },

  // ---------------- Act IV — Selection ----------------
  {
    key: 'act.selectTitle', section: 'actSelect', label: 'Title', type: 'line',
    defaults: { en: 'Selected, reframed', th: 'เลือก แล้วจัดใหม่', ja: '選び、組み直す' },
  },
  {
    // Replaced a hardcoded "MARQUEE TOOL" label, which was English-only.
    key: 'act.selectSub', section: 'actSelect', label: 'Subtitle', type: 'line',
    defaults: {
      en: 'Nothing arrives finished — it is chosen, cut loose, and set down again.',
      th: 'ไม่มีอะไรเสร็จสมบูรณ์มาตั้งแต่แรก — เลือก ตัดออก แล้ววางลงใหม่',
      ja: 'はじめから完成しているものはない。選び、切り離し、もう一度置き直す。',
    },
  },

  // ---------------- Act V — 3D text ----------------
  {
    key: 'act.threeDTitle', section: 'act3d', label: 'Title', type: 'line',
    defaults: { en: 'Now, look at me', th: 'มองฉันสิ ตอนนี้', ja: '今の僕を見て' },
  },
  {
    // Replaced a hardcoded 君は今の僕を見て — Japanese-only, so EN and TH visitors
    // read raw Japanese, and near-duplicate of this act's own title anyway.
    key: 'act.threeDSub', section: 'act3d', label: 'Subtitle', type: 'line',
    defaults: {
      en: 'Not the drawing I made back then — the one I can make now.',
      th: 'ไม่ใช่ภาพที่วาดไว้ตอนนั้น — แต่เป็นภาพที่วาดได้ในตอนนี้',
      ja: 'あのころ描いた絵ではなく、いま描ける絵を。',
    },
  },

  // ---------------- Commissions ----------------
  {
    key: 'comm.title', section: 'comm', label: 'Heading', type: 'line',
    defaults: { en: 'Commissions', th: 'รับงานคอมมิชชั่น', ja: 'コミッション' },
  },
  {
    key: 'comm.status', section: 'comm', label: 'Status — when OPEN', type: 'line',
    defaults: { en: 'OPEN — accepting new projects', th: 'เปิดรับ — รับงานใหม่อยู่', ja: '受付中 — 新規依頼募集中' },
  },
  {
    key: 'comm.statusClosed', section: 'comm', label: 'Status — when CLOSED', type: 'line',
    defaults: {
      en: 'CLOSED — not taking new projects right now',
      th: 'ปิดรับชั่วคราว — ยังไม่รับงานใหม่ในตอนนี้',
      ja: '受付停止中 — 新規依頼は休止しています',
    },
  },
  {
    key: 'comm.takeTitle', section: 'comm', label: '"I take" heading', type: 'line',
    defaults: { en: 'I take', th: 'รับวาด', ja: '受けるもの' },
  },
  {
    key: 'comm.take1', section: 'comm', label: 'I take — item 1', type: 'line',
    defaults: { en: 'Character illustration', th: 'ภาพประกอบตัวละคร', ja: 'キャラクターイラスト' },
  },
  {
    key: 'comm.take2', section: 'comm', label: 'I take — item 2', type: 'line',
    defaults: { en: 'Portrait & half-body', th: 'ครึ่งตัว & พอร์ตเทรต', ja: 'バストアップ・ポートレート' },
  },
  {
    key: 'comm.take3', section: 'comm', label: 'I take — item 3', type: 'line',
    defaults: { en: 'Cover / key art', th: 'ภาพปก / คีย์อาร์ต', ja: '表紙 / キーアート' },
  },
  {
    key: 'comm.take4', section: 'comm', label: 'I take — item 4', type: 'line',
    defaults: { en: 'Personal & commercial work', th: 'งานส่วนตัว & เชิงพาณิชย์', ja: '個人・商用利用' },
  },
  {
    key: 'comm.howTitle', section: 'comm', label: '"How it works" heading', type: 'line',
    defaults: { en: 'How it works', th: 'ขั้นตอน', ja: '進め方' },
  },
  {
    key: 'comm.step1', section: 'comm', label: 'Step 1', type: 'line',
    defaults: {
      en: 'Send a brief + references by email',
      th: 'ส่งบรีฟ + ภาพอ้างอิงทางอีเมล',
      ja: 'ブリーフと参考画像をメールで送る',
    },
  },
  {
    key: 'comm.step2', section: 'comm', label: 'Step 2', type: 'line',
    defaults: {
      en: 'Quote, timeline & sketch approval',
      th: 'เสนอราคา กำหนดเวลา & อนุมัติสเก็ตช์',
      ja: '見積もり・日程・ラフ確認',
    },
  },
  {
    key: 'comm.step3', section: 'comm', label: 'Step 3', type: 'line',
    defaults: { en: 'Final delivery in your formats', th: 'ส่งไฟล์งานในฟอร์แมตที่ต้องการ', ja: 'ご希望の形式で納品' },
  },
  {
    key: 'comm.note', section: 'comm', label: 'Small print', type: 'line',
    defaults: {
      en: 'Turnaround depends on scope · personal & commercial use · ask about current rates',
      th: 'ระยะเวลาขึ้นกับขนาดงาน · ใช้ส่วนตัว & เชิงพาณิชย์ · สอบถามเรตได้',
      ja: '納期は規模により異なります · 個人・商用可 · 料金はお問い合わせください',
    },
  },

  // ---------------- Act VI — Grid finale ----------------
  {
    key: 'act.gridTitle', section: 'actGrid', label: 'Title', type: 'line',
    defaults: { en: 'A field of sunflowers', th: 'ทุ่งทานตะวัน', ja: 'ひまわり畑' },
  },
  {
    key: 'act.gridSub', section: 'actGrid', label: 'Subtitle', type: 'line',
    defaults: {
      en: 'Every line connects back here — where the story began, and where it keeps growing.',
      th: 'ทุกเส้นเชื่อมกลับมาที่นี่ — จุดที่เรื่องราวเริ่มต้น และยังคงเติบโตต่อไป',
      ja: 'すべての線がここへ還る。物語が始まった場所、いまも育ちつづける場所。',
    },
  },

  {
    key: 'comm.cta', section: 'comm', label: 'Enquiry button', type: 'line',
    hint: 'Only shown when commissions are open and you have an email in PROFILE.',
    defaults: { en: 'ENQUIRE', th: 'สอบถาม', ja: '問い合わせる' },
  },

  // ---------------- Contact ----------------
  {
    key: 'contact.kicker', section: 'contact', label: 'Small label', type: 'line',
    defaults: { en: 'GET IN TOUCH', th: 'ติดต่อ', ja: '連絡先' },
  },
  {
    key: 'contact.label', section: 'contact', label: 'Closing line', type: 'line',
    hint: 'The big bracketed line above your email and X links.',
    defaults: { en: '[ LET’S MAKE SOMETHING ]', th: '[ มาสร้างอะไรกัน ]', ja: '[ 一緒に作りましょう ]' },
  },
  {
    key: 'contact.back', section: 'contact', label: 'Back-to-shelf link', type: 'line',
    hint: 'The arrow is added automatically.',
    defaults: { en: 'BACK TO THE SHELF', th: 'กลับไปที่ชั้นหนังสือ', ja: '本棚へ戻る' },
  },
];

/** Fast lookup by key — used by the loader and the Studio editor. */
export const FIELD_BY_KEY = new Map(COPY_FIELDS.map((f) => [f.key, f]));

/** Every key that ships a default, in registry order. */
export const COPY_KEYS = COPY_FIELDS.map((f) => f.key);

export type CopyDict = Record<string, string>;

/** The shipped copy for one language, before any database override. */
export function defaultsFor(lang: Lang): CopyDict {
  const out: CopyDict = {};
  for (const field of COPY_FIELDS) out[field.key] = field.defaults[lang];
  return out;
}
