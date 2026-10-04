# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Pressroom** — a doujinshi (self-made manga) library + reader for illustrator **Asu Azure**,
plus that artist's own profile and art gallery (`/asu`, merged in from the retired `asu-art`
one-pager). The author uploads works as PDF (import-only: pages are rasterized to WebP in the
browser at upload time), arranges pages (drag-drop order, RTL/LTR, forced two-page spreads), and
attaches margin notes readers can see. Readers browse a public library and read with their choice
of single/double layout and scroll/flip mode. Public read, author-only write.

**The visitor journey is shelf first, artist second.** `/` is the bookshelf; **two** entry points
lead to `/asu` — the artist teaser, which now sits **after** the grid (a visitor who has just looked
through the work is the one ready to ask who made it), and a footer link — plus the site header on
every public page. `/asu` always offers a route back.

The teaser is **ink**, not the cream spread it used to be: below the grid a tone flip would land as
a bright slab between two dark blocks. Its proof-sheet decor is retoned in `index.astro`'s scoped
styles — the classes are authored against cream in `global.css` and would vanish on ink. The
"author card" that used to close the grid is gone; it and the teaser were adjacent duplicates.

## ⚠️ Identity separation (hard rule)

Same rule as the sibling `art` repo: this project is **alias-only**.

- **Never** put the owner's real name, résumé/CV, real personal email, or any data-science /
  EdTech content into this project.
- Commit author must be the alias only: `asu-azure <290770255+asu-azure@users.noreply.github.com>`
  (set as local git config — verify before committing).
- No cross-links to the owner's real-name portfolio. Grep for the real name before any push.

## ⚠️ Supabase keys (hard rule)

- Only `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` may exist in this project
  (`.env`, gitignored; see `.env.example`).
- **The `service_role` key must NEVER appear anywhere in this repo, its .env, Vercel env
  vars, or git history — not even "temporarily".** The architecture (anon key + RLS) never
  needs it.
- **RLS is the security boundary.** The `/studio/*` client-side auth gate is cosmetic UX only —
  do not "fix" it with server-side auth; every write is already rejected by RLS unless the
  session belongs to the author's UID. Public signups must stay disabled in Supabase Auth.

## Stack

Astro (`output: 'server'`, Vercel adapter) + **Svelte 5 islands** for everything interactive
(reader, uploader, arranger, dashboard) + supabase-js **in the browser** (no custom
backend) + GSAP + Lenis for motion. `pdfjs-dist` rasterizes uploaded PDFs client-side
(worker via `?url` import, client-only — never import pdfjs in Astro frontmatter).

**Server-side reads are permitted for `<head>` metadata, for `/asu`'s content, for the
homepage artist teaser, and for share cards.** Metadata: public work fields, so a shared link
previews with its real title and cover (crawlers never run the island). Share cards:
`/og/art/<key>.jpg` (below) reads the published artworks to draw one as an image. `/asu` is content-bearing — the page's whole job
is to be read, and an empty first paint would defeat it. The homepage reads `site_copy` for the
same reason and is therefore **`prerender = false`**: a static build would freeze author-edited
copy until the next deploy. Everywhere else, data fetching stays in the browser.

Use `src/lib/supabaseServer.ts` (anon key, no session persistence), never read anything
user-specific, and **always wrap in try/catch — a Supabase failure must degrade to a page that
renders, never to a 500.**

**Public SSR shells are CDN-cached** via `cacheShell(Astro)` (`src/lib/cache.ts`): the edge keeps a
copy for 60 s and serves it stale while it refetches, the browser always revalidates. Used on `/`,
`/asu`, `/lookbook`, `/w/[slug]` and the reader shell. So an author's save reaches visitors within
about a minute (the Studio says so). **Never call it from `/studio/*`**, and never on a page that
sets a cookie or reads anything user-specific.

**Page scripts import copy helpers from `src/lib/siteCopyClient.ts`, never `siteCopy.ts`.** The
latter imports the Supabase client and the whole copy registry; a page script importing
`applyCopy` from it shipped ~200 KB of supabase-js to every `/asu` visitor.

Prefetch is hover/focus only (`astro.config.mjs`). Shelf cards prefetch their overview on
`pointerenter`, because they render after Astro's load-time link scan. Don't turn on
`prefetchAll` + viewport: every card in view would fire an SSR function.

`sanitizeRich()` needs DOMParser and therefore **cannot run on the server**. The write path is the
sanitizing boundary (RichTextEditor sanitizes before every save); SSR uses `richForServer()`, a
dependency-free validator that passes trusted markup through and degrades anything else to escaped
text. See `src/lib/richtext.ts` and its tests.

## Commands

- `npm run dev` — dev server (localhost:4321)
- `npm run build` — production build
- `npm run test` — vitest (layout resolver, richtext validators; `*.dom.test.ts` files opt into
  jsdom via a `@vitest-environment` docblock, since `sanitizeRich` needs DOMParser)

## Supabase setup (one-time)

1. Run `supabase/schema.sql` then `supabase/storage.sql` in the SQL editor — replace
   `AUTHOR_UID` with the author user's `auth.users.id` first.
2. Run the add-on files (each idempotent, safe to re-run): `cover-and-blanks.sql`,
   `translations.sql`, `read-lock.sql`, `library-cards.sql`, `artist.sql`, `site-copy.sql`,
   `scenes.sql`, `book-info.sql`, `novel.sql`, `clean-pages.sql`, `chapter-kind.sql`,
   `release-date.sql`.
   **The homepage will not load without `library-cards.sql`** — it defines the `library_cards()`
   RPC the grid reads. `artist.sql` adds `artist_profile` (a singleton, id must be 1), `artworks`,
   and the public `art` bucket; it also drops the never-used `series` table. `site-copy.sql` adds
   the `site_copy` overrides table — the page still renders without it (defaults ship in code),
   but nothing can be edited. `scenes.sql` adds two columns to `artist_profile`: `scenes`
   (per-section artwork placement) and `commissions_show`. Both default safely, so the page
   renders without it — but the SCENES tab and the commission visibility switch cannot save.
3. Create the author user (email+password) in Auth, then **disable public signups**.
4. Put the project URL + anon key in `.env`.

## Design system ("Editorial FUI", aligned with the owner's portfolio site)

- Tokens & utilities live in `src/styles/global.css` (CSS custom properties — reuse, don't
  hardcode). Signature spreads `.spread--ink` / `.spread--paper` flip the semantic tokens.
  **`global.css` is the only place the spreads are declared.** `motion.css` used to re-declare
  them and, loading later, silently won the cascade; don't add them back there.
- **Paper is cream proof-sheet stock** (`--paper-bg #e9e4d8`) with a faint cobalt blueprint grid
  (`.paper-grid`), crop and registration marks in `--paper-mark`. It replaced the blue Thai-notebook
  stock (blue ruling + red margin rule) in the 2026-09 redesign, by the owner's choice.
- **Long-form prose rules itself.** `.paper-grid` is `inset:0` on its section, so a grid would start
  at the section edge — an unknowable distance above the first baseline — and beat against the text.
  So the bio and the synopsis use `.paper-grid--margin` (sheet left blank) and each `<p>` draws its
  own ruling in `--paper-rule`, pitched in **`lh`** — the element's own computed line box, which
  matches by construction. Don't "simplify" that to `calc(font-size × line-height)`: the browser
  rounds the used font-size, which drifts 0.015px per line. Paragraph gaps are `1lh`.
- Serif narrates (Fraunces), grotesk punches (Space Grotesk), mono micro-labels (JetBrains Mono
  `.mono`). Preloads are exactly those three. One cobalt accent `#2742f0`; warm counterpoint is
  sunflower amber `#e8a31a`. Proof-sheet decor (crop marks, registration marks, ruler ticks) is
  the house flavour. Stack Sans Headline is `/ost`-only and declared in `ost-fonts.css`.
- **Site header** (`.topbar` in `Base.astro`): PRESSROOM · SHELF · ASU AZURE · OST ♪ · sound toggle.
  Opaque, same on ink and paper, height published as `--topbar-h`. Pages that own their whole
  screen pass `topbar={false}` (`/ost`, Studio) or `chromeless` (reader). Fixed page chrome that sat
  at the very top (LangBar, `/asu` language bar, the overview back chip) reads `--chrome-top`.
- Cards and tiles (the shelf's works are 3D books instead — see below): hairline border, 12px radius, the whole card lifts 4px and takes an accent frame
  on hover. **The picture never zooms**, so artwork is never recropped. Buttons are `.btn` pills.
- Motion: Lenis (0.8 s) + GSAP wired in `src/layouts/Base.astro`. Scroll entrances must be
  reversible (`toggleActions: 'play none none reverse'` or scrub — never `once: true`). Ease:
  `cubic-bezier(0.22, 1, 0.36, 1)`. `[data-vel]` headings lean with scroll speed (±5°). Reader page
  flips are transform-only (`translate3d`). Keep each effect short (decode scramble is 400 ms).
- **Page changes are cross-document View Transitions** (`@view-transition` in `global.css`): a
  clip-path wipe, bottom-up going forward, top-down going back (history, or a link with
  `data-vt="back"`). No JS on the critical path; unsupported browsers just navigate. The topbar has
  its own `view-transition-name`, so it stays put.
- Always honor `prefers-reduced-motion` (everything lands on its final state) and coarse pointers.

### MV motion (`src/styles/mv.css` + `src/scripts/mv.ts`)

The vocabulary of the owner's music-video engine (`music-repo/visualizer/player2`), cut down for a
page. Each helper is ≤ 600 ms, first-view or interaction only, and lands on its final state under
reduced motion. Continuous effects (bloom, grain, letterbox, shimmer) stay in the videos.

- `[data-mv-converge]` / `use:converge` — RGB split converging plus two clip bands, on section
  headings. Drawn with `text-shadow` inside the keyframes only, so `applyCopy()` can swap the
  words at any time. Islands must use the action: they mount after `initMv()` sweeps the page.
- `slideIn(el)` — characters shoot in from both sides and brake (the `/asu` name). Never splits
  Thai; mark-stacking scripts fall back to converge. `mv.ts` keeps its own copy of the
  `MARK_SCRIPTS` test, because importing `kinetic.ts` would put split-type on every page.
- `punch(el)` — a 180 ms scale kick (reader page number and heart, lightbox open). Needs a box
  that takes transforms: inline spans must be `inline-block`.
- `strike(x, y)` — the note-strike ring, fixed to the viewport. Pressing any `.tile`, `.btn` or
  `[data-strike]` rings one at the pointer.
- The page transition opens with a 110 ms stepped cut (jitter + channel split) before the wipe.
  Opening the reader uses `html[data-vt='reader']`: a plain punch-in, because reading is a change
  of scene.

### The press run + loupe (`src/scripts/press.ts`, homepage hero only)

The site is a pressroom, so the shelf hero's art is *printed*: one WebGL canvas separates it into
C, M, Y, K plates that print in order, each sliding in from off-register (~0.9 s, the hero's whole
entrance). The shader also draws the scrim that `.lib-hero__art::after` used to, so the CSS scrim
is dropped while the canvas is live (`.is-pressed`).

- **Loupe** (fine pointers only): ×3 glass under the pointer showing the real halftone (C 15°,
  M 75°, Y 0°, K 45° → rosettes) plus a densitometer readout of the ink under the crosshair (read
  from a 240 px CPU copy). This is **not** the retired custom cursor: it sits exactly on the pointer
  every frame (no easing, nothing trails), the system cursor stays, and it lives *under* the type.
  Keep all three true if you touch it.
- Fast scrolling knocks the plates out of register; they spring back.
- `html[data-press="pending"]` is set by an inline script **before first paint** so the photo is
  hidden and the plates print from blank. A 2.5 s failsafe removes it, and every failure path
  (no WebGL, shader error, lost context, undecodable image) removes it too — the `<img>` is always
  the real picture. Reduced motion never sets it.
- No frame loop at rest; paused off-screen; DPR capped at 1.5. This is the site's only WebGL
  context — don't add one to `/asu` (see below).

### The shelf's books (`WorkCard.svelte` + `src/scripts/book3d.ts`)

Each work is a CSS 3D box — front, back, spine, fore-edge, head, tail — **depth from the page
count** (a touch over true scale — the owner found double scale too thick). Authors upload the whole wraparound as the cover page and crop
the front, so the leftover is the **back cover** and a sliver at the crop edge wraps the spine.
With no crop, the back is plain stock. Binding side comes from the wraparound, else RTL → right.

- At rest the fore-edge faces out (the leaves make the depth legible). Hover turns the book to
  the pointer on a damped spring; **drag turns it over** (release keeps angular velocity, lands on
  the nearer cover). **Click swings the front board open on its hinge (300 ms), then navigates** —
  the owner asked for exactly this back after a round where the cover "flew" into the overview
  instead (removed). The navigation goes through `navigation.navigate()` where the Navigation API
  exists, because Chrome keeps the page wipe for that from a timer but drops it for
  `location.assign()` (see Gotchas). `pageshow` (bfcache) closes the board again.
- **The hit area never moves** — the link and `.book-card__stage` are fixed; only `[data-book]`
  rotates. That is what keeps this on the right side of the "magnetic hover" rule.
- Vertical touch movement is a scroll (`touch-action: pan-y`); only a horizontal drag spins.
- Titles live on the label **under** the book, never over the cover: the covers carry their own
  lettering and the old overlay collided with it. Books stand on planks drawn per item (±½ gap);
  the last one runs on and fades — room for the next book.
- Reduced motion: the resting pose, a plain link, no hint line.
- **Release order** (`lib/release.ts`, tested): the shelf stands oldest first by `works.released_on`
  (the first release, 初版 — `supabase/release-date.sql`); undated books follow in the query's order
  (most recently edited first, as before). Sorted **in the browser**, not in the query: ordering by
  the column before it exists would fail the whole select, and `library_cards()` doesn't need it
  (the shelf reads `works.*` itself — its fixed return type stays). The label leads with the year:
  「2025 · 本編 · 79P · RTL」. A book with a `series_title` says 本編 / 外伝 (`kindKey` in
  `lib/series.ts`), never 読切 — both books said 読切 and read as unrelated; the overview's meta uses
  the same. The meta line is ONE text node on purpose (a flex row: a `{#if}` split it into items
  whose edge spaces collapsed, 「本編 ·79P」).
- **読む順番 → 時系列** sits in the shelf's head row (not under the grid: the shelf must keep its
  placeholder's height), shown when a book the timeline covers is on the shelf; the footer links
  `/timeline` too.
- **小説しおり**: a place saved in the novel reader shows on the label as 「小説しおり 第三話」
  (`novelProgress` in `lib/novel.ts`) — text only, the novel has no pages to put a card at.
- **付箋 & しおり** (`src/lib/shelfmarks.ts`, tested): the reader also saves progress and ここすき
  favourites as *positions* (`pressroom:shelfmarks:{workId}` = total / at / favs), because the shelf
  can't map page IDs to order — locked works hide their page rows from anon reads. The book then
  shows a sticky tab out of the fore-edge per favourite (by depth, walking down 5 slots, max 12) and
  a bookmark card out of the head at the page being read; the label adds "しおり p.N · ♥ n".
  Re-read on `pageshow` (bfcache) and `storage`. Only ever this visitor's own browser data.

### The book overview (`/w/[slug]`, `BookOverview.svelte`)

Order: hero → (この本の構成) → 収録内容 → 登場人物 (a night set, below) → spoiler band + あらすじ → シリーズ → foot. The
visitors it is written for are Japanese; the books are Thai.

- **この本の構成** (`lib/bookParts.ts`, tested): a book with 2+ chapters lists its parts above the
  contents — 第一部 / PART 1, the title without the number the author wrote into it (`partName`), a
  小説 / マンガ badge from `chapters.kind` (`supabase/chapter-kind.sql`), the page range, a language
  line (`partNote`: a novel part names its `novel_langs` — 「日本語で読めます」 — a manga part its
  translation or 「タイ語のみ（翻訳なし）」) and its own button: a novel part with text opens the novel
  reader, any other part the page reader at its first readable page (`?p=`). Vol. 2's novel and
  manga read as two unrelated things before this. Chapters are public even while the book is
  locked, so titles and kinds show; ranges and landing pages wait for the pages (`bookParts(…, null)`),
  and a locked part's button hands LockGate a *function* (`pendingHref`), resolved once the
  unlocked rows are in.
- **A book whose part is a novel with text leads with its parts** (`partsHero` in `lib/bookParts.ts`,
  tested; vol. 2): the hero's buttons are 「第一部 小説を読む（日本語）」 (the novel reader; with a
  saved place 「第一部 続きから読む（第三話）」) and 「第二部 マンガを読む」 (the page reader at that part;
  「マンガの続きから」 when the page-reader place is inside it), then 共有; the whole book as pages is a
  quiet link 「原本をページで見る（タイ語）」 (the saved page-reader place, else p.1). 「読み始める」 used to
  open the scans of the Thai novel, and readers never learned the Japanese text existed. Other
  books keep the plain hero.
- **The novel's chapters under its part** (`novelToc` in `lib/novel.ts`, tested): はじまり, 第一話 …
  第六話 — the novel reader's own 目次 (`chapters()`), titles in the language the novel button opens
  in, each a link into the reader at that section (`?s=`). Read from `novel_sections` (titles only);
  a locked book's sections are hidden, so the list appears once this tab has the password (through
  `unlock_novel`, also right after the gate opens) — **before that the part shows just its button**.
- **The floating 「← 書庫」 and language switch** (`html[data-ovchrome]`, BookOverview): they blend by
  difference and read as noise over text, so scrolling down they step away and scrolling up they come
  back on a solid ink chip; at the top they are as before.
- **The novel button remembers** (`novelProgress` / `resumeLabel` in `lib/novel.ts`, tested): with a
  place saved in the novel reader (this browser only), the hero's novel button and the novel part's
  button read 「続きから読む（第三話）」 and open the novel in that place's language, where it resumes.
  The novel reader saves the chapter's number with the place (`SavedPlace.chapter`, `chapterNumber`)
  because the overview can't read a locked book's sections; a bare {0,0} (the reader just opened) is
  not progress, and a place saved before the number was kept gets plain 続きから読む. The button is
  filled when there is no page-reader progress. Both saved places are re-read on `pageshow` (bfcache).
- **`?go=` — the gate takes you there** (`lib/readerLink.ts`, tested): a locked reader (page or
  novel) that can't unlock sends its visitor to `/w/slug?go=<its own path+query>`; the overview strips
  it, opens the LockGate at once and goes there on unlock. Only this book's own `/read` or `/novel`
  path is accepted (`lockReturn`) — never another site, book or page. That is what makes a timeline
  link (`?n=66`) or a shared page link work on a locked book.
- **「しおりについて」** (`components/reader/BookmarkNote.svelte`, a plain `<details>`) under the hero
  buttons, by 「続きから読む」: the place and the ここすき live in this browser on this device only — not
  on other devices, not in another app's built-in browser (a link opened from X or LINE), gone in
  private browsing or when site data is cleared, never collected. The same note sits in both
  readers' 設定.

- **The hero shows the front of the wraparound** (`frontOnly` + `cropImgStyle`, full-size image —
  the front is half the picture). No `inner` page on purpose: a locked book's pages arrive on
  unlock, and the hero would re-trim and jump.
- **奥付 row + content notes** from `supabase/book-info.sql` (all optional): `book_lang`,
  `translations`, `formats`, `release_label`, `content_warnings`, `series_*` (`lib/bookInfo.ts`,
  tested; language names via `Intl.DisplayNames`). **頒布 lists every printing on its own line**, the
  first release first: `release_label` is split where a new date starts (「2025年11月 Comic Avenue 10
  （初版）・2026年3月 Comic Square 9（再版）」, `releaseLines` in `lib/release.ts`); with no label the
  first release date stands in as a month. "翻訳 なし" is shown on purpose — it is how a
  Japanese visitor learns the Thai book has no Japanese yet. But a novel part that reads as text in
  another language (`novel_langs`) counts: vol. 2 says 「日本語（小説パート）」, never なし. Content notes sit above the read
  button, amber, `role="note"`. Studio META edits them all (content notes one per line).
- **Locked contents is one bar**, not a box: with no `password_hint` it says 限定公開 — 合言葉を
  お持ちの方のみ読めます and never where the password comes from (the owner hands it out in closed
  circles). LockGate says the same.
- **登場人物 is a night set in the STARFALL MV's language** (`CastStage.svelte`, rules in
  `lib/castView.ts`, tested; the owner asked for "beautiful, with style, like the MV"). Letterbox
  bars, static bokeh, window-light beams (scrubbed sideways), faint grain, and the title in front of
  a slit of light — the series' door left ajar. Each **main** character (`Character.main`; none
  marked → the first two) is a scene: a taped photo print of `portraitUrl` (else the first gallery
  image, else the icon) with the name hand-written on its margin, their `quote` set vertically
  beside it with （name） above — the MV's subtitles — then role · `age`, the name (Japanese large,
  Latin spaced under it — `splitName` reads the Studio's 「タイム/Time」), the real name, the
  spoiler-free `bio` and 「プロフィールを見る」. Scenes alternate sides; two lights ride an orbit behind
  the first two (the MV's pair of stars, scrubbed). The rest are smaller prints pinned in a row.
  **Black-and-white art is duotoned in CSS** (`portraitMono`): ink → a deep shade of the
  character's colour, paper → warm cream, plus a corner light leak; colour art lends the set its
  own light (the picture blurred behind the scene). The file keeps the real picture. Motion: prints
  drop in and settle, the line is written top to bottom (clip), names converge — all reversible or
  scrubbed, final state under reduced motion. The prints never zoom their picture; hover lifts the
  paper.
  **The cast sits above the spoiler band, so `bio` is spoiler-free**; what the book reveals goes in
  `secret`, shown in the cast file behind 「⚠ ネタバレを含むプロフィール」 (a `<details>`). The file also
  shows `age`, the `quote` and the portrait first in its gallery (`galleryOf`). Studio's character
  editor has every field (main, age, line, portrait + B/W switch, spoilers).
  Faces: `PR Cast Mincho` (Shippori Mincho B1) for names, titles and lines, `PR Cast Hand` (ダーツ
  フォント — the MV's handwriting) for the print captions — renamed OFL subsets cut by
  `scripts/cast-fonts.py` from `scripts/cast-glyphs.txt`, which writes `src/styles/cast-fonts.css`
  (exact unicode-range: a missing kanji falls through to the authored stack). Imported by the
  overview page only. **Add a new name's kanji to cast-glyphs.txt and re-run the script.**
- **The synopsis stays open** (the owner's call) behind a full-width amber spoiler band with a skip
  link to `#ov-after` (the series section, or the foot). The section nav comes after the band —
  book 1's headings are spoilers themselves.
- **`tidyForeword()`** (`lib/foreword.ts`, `foreword.dom.test.ts`) tidies the stored HTML at render
  time only: drops inline `font-family` naming the SUBSET webfonts (a paste had set 96 % of one
  synopsis in 'Noto Serif JP'), empty blocks (each drew an empty ruled line), a leading h1 repeating
  the title (then demotes headings); and promotes bold numbered run-ins ("1. 出会い 本文…") to h2
  with ids, which is what the section nav is built from. The editor's font menu now offers system
  mincho/gothic stacks instead of the subset names — the root cause.
- **Series**: published works sharing `series_title`, queried directly (not through
  `library_cards()`, whose return type would need a drop) after the page is up, try/catch;
  `lib/series.ts` orders them and finds prev/next. `series_kind` main/side → 本編/外伝. A book on the
  timeline adds 「読む順番は？ → 時系列」 under the series cards.
- **SHARE** (`lib/share.ts`, lifted from the lightbox): share sheet on touch, copy on desktop.
- ⚠ The JP subset fonts in `public/fonts/` predate most of the chrome copy: kanji like 読 訳 翻
  限 are missing from them, so those labels mix in a fallback face. Regenerating the subsets from
  the kanji in `src/` is an open follow-up.

### The timeline (`/timeline`, `components/timeline/Timeline.svelte` + `src/data/timeline.ts`)

Which order to read the books in, and when each part is set — the books jump in time on purpose
(vol. 1's last pages are set three years after vol. 2's novel). One page, two views, and the note
「刊行順に読むのがおすすめです。本は、わざと時間を行き来しています。」 at the top:

- **刊行順** — the series' books from the database in shelf order (`shelfOrder`), each with its
  front cover, Nº + year, every printing (`releaseLines`), format (マンガ / 小説+マンガ, from
  `works.formats`), 本編/外伝 and a link to its overview. A later book that joins the series
  (`series_title`) appears by itself. Offline: the data file's books, without covers or dates.
- **物語の時系列** — three eras on a vertical line (子ども時代 · 3年後・中学1年 · さらに3年後・高校時代),
  each listing the part of each book set there with its reader page range, a 小説/マンガ tag, the
  point of view when the book says so, and a button: the novel reader for the novel part, the page
  reader at the part's first page for manga (`?n=`, below). The line ends at the last era.
- **Spoiler-free and uncommitted on purpose (the owner's calls)**: eras and points of view only —
  no places (チャンタブリー / バンコク were removed 2026-10-05), never what happens, and nothing about
  a book that isn't out: the closing 「次は：フランクの物語（予定）」 and its afterword credit were
  removed, the owner won't commit to the next book. `timeline.test.ts` guards both.
- **The content is a typed data file** (`src/data/timeline.ts`, JA + EN strings, `timeline.test.ts`):
  slugs, reader page ranges (inside the book, no page in two eras, the p.65→66 time skip), both
  languages present. Ranges are **reader pages** (cover = p.1, blanks counted), checked against the
  books: 夜光虫編 p.1–65 childhood, epilogue p.66–75 (p.66 opens 「で、三年たって」; p.76 is a guest
  illustration, p.77 the afterword); 雨上がりの空編 第一部 p.1–65 novel, 第二部「大人の重荷編」 from p.66,
  its story ending p.82 (p.83–84 are the afterword and colophon, inside the DB chapter's 66–84).
  Re-check them if pages are added or reordered.
- JA/EN like the reader and library chrome (`i18n.t` + `pick()`); Thai visitors read English. Book
  titles stay as printed in every language (`.authored`), and the page's Japanese body text uses the
  authored stacks too (the subset webfonts predate these kanji).
- Prerendered shell (`prerender = true`, no server reads, no `cacheShell`), the island `client:only`
  like the shelf. Linked from the shelf's head row and footer, the overview's series block, and the
  foot of both readers' 使い方 guide (「読む順番は？ → 時系列」, `ReadingGuide`'s `timeline` prop — Tab
  then cycles between OK and the link). Only for works the data file covers (`inTimeline`).
- **`?n=66` deep link** (`pageByNumber` in `lib/readerLink.ts`): the page reader opens at the n-th
  page. The timeline can't use `?p=`: a locked book hides its page ids from anyone who hasn't
  unlocked it. `?p=` and `?ch=` still win over it.

### Removed on purpose — do not reintroduce

- **Custom cursor and `[data-cursor]` labels** — a second cursor that trails the real one reads as lag.
- **Magnetic hover (`[data-magnetic]`)** — click targets that move are harder to hit.
- **The bird-flock page transition (`flock.ts`)** — it covered the destination until its module
  loaded (2.5 s failsafe) and drew up to 2400 boids per frame. View Transitions replace it.
- **OGL displacement on `/asu`** and the `ogl` dependency — a WebGL context on the page whose job is
  to show the art. **Film grain** (`.grain`) — a full-viewport animated blend layer.
- **The ambient constellation canvas on `/asu`** (still used by the `/lookbook` acts) and the kanji
  watermark on the book hero.
- **The storybook ("tale") theme** of 2026-09-18, reverted in favour of this system. Recoverable
  losslessly from the git tag `tale-storybook-v1`.

## The artist page (`/asu`) and its Studio editor

- Everything on `/asu` is editable at `/studio/artist`, split so there is **one place per thing**:
  - **PROFILE** — only what is the same in every language: display name, portrait, links,
    commissions flags.
  - **COPY** — every word on the page, in 日本語 / ENGLISH / ไทย. See the section below.
  - **SCENES** — where artwork appears outside the gallery. See the section below.
  - **GALLERY** — artwork upload, drag-reorder, retitle, feature, publish, delete.
- `artist_profile.bio` and `artist_profile.craft` are **no longer read or written.** Those words
  moved to `site_copy` (`story.p1`, `story.p2`, `craft.item1–3`) so they exist in all three
  languages. The columns remain for old rows; do not reintroduce editors for them.
- **Storage rule: web-resolution derivatives only.** Every upload becomes full 1600 / med 900 /
  thumb 320 WebP (`src/lib/artImage.ts` over the shared `src/lib/imageEncode.ts`). Print-res
  originals stay on the author's machine — never upload them. The free tier is 1 GB and the books
  already use ~71 MB; at ~370 KB per artwork there is room for well over a thousand pieces.
- Unlike work deletion, **deleting an artwork also deletes its three storage objects.** A gallery
  churns far more than a published book, and the paths are known without listing the bucket.
- **The gallery is a studio wall by default, with the masonry as GRID** (one set of buttons, two
  views; `data-view` on `.wall`, choice in `localStorage['pr:gallery']`, picked by an inline script
  before paint; no JS = grid). Layout `src/lib/wallLayout.ts` (pure, tested: hash-jittered prints,
  shortest-row packing, lead spans two rows, no overlaps) runs on the server into per-tile CSS vars in
  world units; `--u = 100cqh / --wh` makes the rows fill the wall's height. Camera `src/scripts/wall.ts`:
  drag + inertia + rubber band, ctrl/⌘ wheel & pinch zoom, − ＋ FIT ALL, keys, minimap, pin-up
  entrance, hover lifts the paper (`.asu__print`) not the button. Click flies the print into the
  lightbox and back (`originOf` in `lightbox.ts`); a mouse resting 250 ms on a piece prefetches its
  full size so the flight lands on it (mouse only — no data spent guessing on phones). Plaster tile:
  `node scripts/wall-tiles.mjs`. Not the retired strip: 2-D, ~2½ screens at rest, FIT/ALL, map, GRID.
  **Performance rules, each measured on the prod build in headed Chrome on an Intel UHD 610**
  (pan/fling/zoom now match the GRID page: 60 fps, one ~50 ms frame the first time a pan reveals
  unseen wall):
  - **No transitions on the 53 prints at rest.** Prints used to swing while the wall panned
    (`--sway` → `rotate` transitions); Chrome ran those on the main thread and restyled ~300
    elements every frame (17–56 ms each, 2.4 s of style work in one pan). Removed. Transitions exist
    only during a filter re-hang (`.is-relayout`) and on the one hovered paper.
  - **The pencil grid is its own box** (`.asu__grid::before`), not four more layers of the wall's
    background. Six background layers on one element held panning at ~30 fps; split, 1–5 slow
    frames per test instead of 35–144. Either half alone is cheap.
  - Neighbouring prints are fetched and `decode()`d only after the wall has been seen and the page
    is idle (`warm` in `wall.ts`); at load that competed with the hero.
  - Load: with a warm cache the wall costs ~60 ms more main-thread work than the grid (style + layout
    of the prints); the pin-up entrance itself is not the cost (stubbed out, no change).
- (Before the wall) **the gallery was a masonry grid** (CSS columns), not the drag strip it started as: nineteen
  pieces in one horizontal track meant hundreds of rem of dragging, and an illustrator's work runs
  0.36 to 1.34 aspect, so nothing is cropped. `.tile--natural` is the modifier that undoes the
  base `.tile`'s 4/5 crop — don't change `.tile` itself, the library cards borrow from it.
  Featured leads at `column-span: all`, constrained by width so it too stays uncropped.
- **`displayOrder`, not sort order, drives the lightbox.** Featured is pulled to the front of the
  grid, so indexing the manifest by `sort_key` would make the counter disagree with the number
  printed on the tile that opened it.
- `featured` is exclusive — the page leads with that piece and the toggle unsets the others.
- **The lightbox has a loupe** (`lightbox.ts`, fine pointers, motion allowed): ×2.5 glass drawn from
  the full-size image with `background-position` — plain CSS, because /asu stays WebGL-free. It is
  exactly on the pointer, never takes pointer events, and hides on navigation and close.
- **Every piece has its own link: `/asu?art=<key>`** (`src/lib/artLink.ts`, tested; key = the
  uuid's first 8 hex digits — stable across reorders, unlike the printed Nº). The page is the same
  `/asu`; the server swaps the meta (title, alt as description, `canonical` with the query — a
  `Base` prop, because the default canonical drops queries) and the script lands on the piece:
  scrolls to the gallery, centres the wall's camera on its print (`wall.reveal`), opens the
  lightbox, so closing flies it home. The lightbox reports what it shows (`onShow`) and the page
  keeps the URL in step: opening pushes ONE history entry (a phone's Back closes the piece), ← →
  replace it, closing pops it. ScrollTrigger resets the scroll on load/refresh, so the landing
  re-applies its position while the piece is still open. **SHARE** in the lightbox: the share
  sheet on touch, the link copied on desktop. The Studio's GALLERY rows have COPY LINK.
- **Share card: `src/pages/og/art/[key].jpg.ts`** — 1200×630 JPEG of the piece as a print on the
  studio wall, with the tilt and tape/pin it has on the wall (`hangGallery` in `wallLayout.ts`,
  same `galleryOrder` as the page). Geometry + one SVG overlay in `src/lib/shareCard.ts` (pure,
  tested), rasterised by **sharp — a runtime dependency now, keep it in `dependencies`**. No
  `<text>` (a function has no fonts), no files from `public/` (the plaster grain is regenerated in
  code, tested pixel-identical to `plaster.png`); librsvg reads JPEG/PNG data URIs, not WebP, so
  the picture is re-encoded first, and sharp won't tile anything taller than the card (the mottle
  is 560 px, not the wall's 700). Cached a year at the edge — the page adds `?v=<hash of the
  picture URL>`. Unknown key → 404; any failure after the piece is found → 302 to its 900 px
  picture, so a share still shows the art. ~0.35–0.4 s to draw cold, 77–97 KB.
- Two separate commission switches: `commissions_open` picks WHICH line shows,
  `commissions_show` picks whether commissions are mentioned at all. Hiding takes the hero line
  and the whole craft-section panel together.
- Gallery order uses fractional index keys like pages: a drag is one row UPDATE.
- Seeding from the old site: `node scripts/seed-artist.mjs` (`--dry` needs no credentials and just
  proves the pipeline). The bio it writes is an **AI-written draft carried over from asu-art** —
  rewrite it in your own voice.

## Artwork outside the gallery — the scene slots

Same registry-in-code, overrides-in-the-database shape as page copy, for the same reasons.

- **`src/data/sceneSlots.ts`** defines each slot: key, the section a visitor sees, label, hint,
  which of the four modes it offers, how many pieces it places, and its fallback.
- **Three treatments.** `photo` keeps the scenery photograph; `plate` keeps the photograph and
  pins the drawing on it, framed and rotated; `backdrop` hands the whole background over. A
  drawing behind the acts' scrim at `cover` goes muddy and loses its subject, so `.act__bg--art`
  is `contain`, nudged off centre and dimmed — a plate laid on the spread, never wallpaper.
- **`src/lib/scenes.ts`** — `resolveScenes()` is pure and answers for every registered slot no
  matter what is in the column: junk, an unoffered mode, or an artwork id deleted since all fall
  through to the fallback, and an art mode with an empty gallery degrades to the photograph. Two
  fallbacks reproduce the page's original composition on purpose — the character act leads with
  the featured piece, the selection act collages the first two. Tested in `scenes.test.ts`.
- **`src/components/ActScene.astro`** renders one act's backdrop plus its plates. Two acts were
  designed around a specific composition and keep it via `variant`: `frag` (the selection act's
  two rotated fragments) and `char` (the character act's double exposure).
- The two cream spreads use `.plate--flow` instead: a paper spread has no scrim to lift art off,
  so their plate sits in the flow beside the words rather than pinned over them.
- **Adding a slot = one entry in `sceneSlots.ts` + one `scenes['key']` read.** No migration.

## Page copy — `site_copy` + the code-side registry

Every word on `/asu` and the homepage artist teaser is author-edited, in three languages.

- **COPY previews live.** The tab runs the real page in an iframe beside the form. Because the
  Studio is same-origin with it, and `applyCopy(bundle, lang, root)` already takes a root, typing
  paints straight into the preview document — no receiver script, no `postMessage`. Clicking a line
  in the preview jumps to its field; focusing a field scrolls the preview to it and follows the
  section's `page` to `/asu`, `/` or `/lookbook`.
  **⚠ Every preview-only behaviour — the click handler, the hover outline, the link guard that stops
  navigation — is injected INTO the iframe from `StudioCopy.svelte`. None of it lives
  in the pages, so a visitor can never receive editing chrome. Keep it that way.** Verified by
  build: `is-copytarget` / `data-fieldkey` appear in the `StudioArtist` bundle only, loaded solely
  by `/studio/artist`.
  A key is previewable only if it renders through `data-i18n` / `data-i18n-html`; otherwise the
  field shows NOT VISIBLE (`meta.title` goes to `<title>`; the commission and hero-status pairs are
  written as ternaries so only one of each is ever in the DOM, and both vanish when
  `commissions_show` is off).
- **Both Studio tabs group by page.** `PAGE_GROUPS` in `copyKeys.ts` is the single source, consumed
  by COPY and SCENES alike, and every `CopySection` / `SceneSlot` declares its `page`
  (`'asu' | 'home' | 'lookbook'`). ⚠ **A new section or slot with no `page` will not appear in the
  Studio at all.** Section order within a group must match that page's scroll order — when a page's
  layout changes, move the registry entries with it, or the author is editing blind.
- **The registry lives in code**: `src/data/copyKeys.ts` defines each field's key, section, human
  label, hint, and its default in all three languages. **The database stores only overrides.**
  Three consequences worth keeping: the Studio form is *generated* from the registry so its
  sections always match the page's scroll order; the page can never render blank; and clearing a
  field deletes its row, which is how RESET works.
- Defaults were carried over verbatim from the retired asu-art one-pager's `dict`. They are the
  site's voice — don't casually rewrite them.
- `src/lib/siteCopy.ts` — `loadCopy()` (server, try/catch, merges DB over defaults, validates rich
  values through `richForServer`) and `applyCopy()` (client, swaps `[data-i18n]` / `[data-i18n-html]`).
- **Rich copy renders into a `<div>`, never a `<p>`** — RichTextEditor emits its own `<p>` blocks
  and nesting them breaks the markup.
- Adding a line to the page = one entry in `copyKeys.ts` + one `data-i18n` attribute. No migration.

### Languages

`src/lib/lang.ts` is the single source: `ja` (default) | `en` | `th`, runes-free so Astro
frontmatter can import it (`i18n.svelte.ts` cannot — `$state` needs the Svelte compiler).

**Only `/asu` and the homepage teaser are trilingual.** The reader, library and studio chrome stay
JA/EN and fall back to English for a Thai visitor via `I18n.t()`. That is deliberate: Thai exists
for the artist's own words, and one language control is less confusing than two.

`i18n.set()` also dispatches `LANG_EVENT` on `document`, because the teaser is static Astro markup
and cannot read a Svelte rune. One switcher, two rendering worlds.

**Thai typography** (rules in `global.css`): there is **no font-family switching by language.**
Every token stack lists the Latin face first, then Thai, then Japanese, and the browser resolves
per glyph — so Latin renders identically in all three languages and only Thai codepoints reach the
Thai face. Don't reintroduce `html[lang='th'] { font-family: … }`; that is exactly what made
English change shape when the language changed.

**Author-written Japanese must use `.authored` / `--font-serif-authored`.** The Noto JP webfonts
in `public/fonts/` are per-glyph subsets of the kanji present in **`src/`**. Author copy lives in
Supabase, so its kanji were never candidates: 56% of one synopsis was missing from the subset.
The `@font-face` claims the whole CJK `unicode-range`, so the browser commits to Noto, finds the
glyph absent, and falls through per glyph to a generic `serif` — whose CJK it resolves from
`<html lang>`. Signature: **the same Japanese looks right under 日本語 and mixes mincho with gothic
under EN/ไทย.** Any element rendering database text (work titles, character names, synopsis, bio)
needs `.authored`, which names real system JP faces — one font per paragraph, zero bytes, no `lang`
dependence. Never put `'Noto Serif JP'` / `'Noto Sans JP'` in those stacks; the `Noto … CJK JP`
names are the *system* families and are safe.

Both Thai faces are **loopless** (ไม่มีหัว): Ekkamai Vibe for text, Prompt for display (its top
metrics survive `background-clip: text`). The looped Royal Institute of Siam was dropped — don't
add it back without asking; the loop/no-loop choice is the owner's call, not a technical one.
**One exception, the owner's call (2026-10-03): Thai prose in the novel reader is Noto Serif Thai
(looped)** — 50,000 characters read easier with loops (ด/ค, บ/ป, ถ/ภ). One face, no toggle; the
site's chrome stays loopless. Self-hosted variable woff2 (thai + latin, OFL) declared in
`src/styles/novel-fonts.css`, imported only by `/w/[slug]/novel`.

What stays language-conditional is **leading only, scoped to `[data-i18n]`**. Thai vowel/tone marks
stack, so display type at 0.86 line-height collides them — but the fix must only reach elements
that actually hold Thai. Every Thai string arrives through a copy key, so those attributes mark
exactly the right elements. An unscoped `html[lang='th'] .mega` rule previously un-uppercased and
re-tracked the Latin `PRESSROOM` masthead.

Do **not** add `text-transform: none` or letter-spacing overrides for Thai: Thai codepoints have no
uppercase mapping, so `uppercase` is already a no-op on them — such rules only damage the Latin
sharing the selector. **Never split Thai per-character** — `kinetic.ts` guards this with
`MARK_SCRIPTS`.

## The six acts — extracted, not deleted

**`/asu` is a portfolio now**: short hero → gallery (01) → about (02) → contact (03). Four sections.
The art is visible without scrolling; the bio and craft/commissions spreads merged into one paper
section, because two cream spreads back to back read as one idea interrupted once the acts that
separated them were gone.

**The six cinematic acts live in `src/components/acts/` and are rendered by `/lookbook`.** They were
extracted rather than deleted, and the reasoning matters: the design *vocabulary* is in
`global.css` + `motion.css` + `src/scripts/`, so deleting act markup would not have lost the system
— but the **compositions** (backdrop + FUI corners + drawn geometry + heading, per act) exist
nowhere else. `/lookbook` is what stops them rotting unseen; if an act breaks, that page shows it.
Reusing one costs a single import.

- Each act carries its **own `<script>`** for its section-scoped effect (`ActFilm` → cinema+channel,
  `ActScatter` → scatter, `ActGrid` → grid3d), so dropping the component in is all that is needed.
- The attribute sweeps several acts share — `[data-select]`, `[data-3dtext]`, `[data-assemble]`,
  `initDraw` — live in **`ActRuntime.astro`**, included **once** per page. Putting them in each act
  would re-register them per act.
- **`/lookbook` reads the author's real copy and scenes** (`prerender = false`, `loadCopy()`,
  `resolveScenes(profile.scenes, works)`), and carries the same language switcher as `/asu`. It was
  first written data-free "for robustness" and that silently broke the Studio: the six act sections
  in COPY and SCENES still edit these acts, so with defaults hardcoded there, **every act box in the
  Studio changed nothing anywhere** — while the author had already written all twelve act lines in
  three languages. If you ever make this page data-free again, delete those Studio sections in the
  same commit. Failure still degrades: the query is wrapped and `loadCopy()` falls back on its own.
  Unlisted — reachable only from Studio's `VIEW /lookbook ↗`.
- **The registries deliberately still carry all six acts.** `sceneSlots.ts` keeps `act.*` slots and
  `copyKeys.ts` keeps the act titles/subtitles: `scenes.test.ts` covers those slots by name, and any
  override the author already saved would be orphaned if they were removed.
- `.selbox.is-armed` (marching ants, handles, W×H readout) is **never toggled by any script** and
  never has been — dormant CSS shipped with the system, not a regression.

For reference, the retired long-form order was: hero → act-film → bio → act-scatter → gallery →
act-character → craft → act-select → act-3d → act-grid → contact.

- **Most of the CSS was already here.** `global.css` shipped the Editorial FUI system —
  `.act__*`, `.pillarbox`, `.sidecol`, `.fui`, `.selbox`, `.wiregrid`, `.draw-svg` — unused. Reuse
  it; do not add parallel styles.
- **But the per-act inner layout was NOT** — `.act-film__*`, `.act-scatter__*`, `.act-char__*`,
  `.act-select__*`, `.act-3d__*`, `.act-grid__*` and `.frag*` were left behind when the markup came
  across, so every act's text block was unstyled and the character subject and collage fragments
  rendered as raw images. Ported verbatim from `art/src/pages/index.astro` (~lines 778-828). If
  anything else from the art site looks wrong here, check that repo before writing new rules.
- Modules in `src/scripts/`: `cinema`, `channel`, `scatter`, `grid3d`, `perspective`, `select`,
  `ambient`, `draw`, `kinetic`. Each owns its own reduced-motion / coarse-pointer
  fallback, so the page calls them unconditionally.
- **`text.ts` and `kinetic.ts` both export `assemble`, and they are different.** `text.ts`'s is the
  hero-name version already in use; kinetic's is per-character. `/asu` imports the latter as
  `kineticAssemble`.
- `draw.ts` needs `DrawSVGPlugin`, which ships in the public `gsap` package since 3.13.
- Act backdrops are scenery photos in `src/assets/scenery/`, encoded through `getImage()` at
  quality 60 — they sit behind a scrim and must never be full-quality.
- Every act's imagery is the author's **own artwork** where they want it, not fixed files — the
  scene slots above decide, per act, between the photograph, a pinned plate and a full backdrop.
  With an empty gallery each slot degrades to its photograph and the acts still stand up.

## Music features are behind a flag (`PUBLIC_MUSIC`)

**Everything musical is off in production** until the owner launches it: `/music`, `/music/<slug>`,
`/ost` (a redirect), `/ost/tobira`, the soundtrack keychain on the shelf, the `MUSIC ♪` links, the
SOUND switch and the UI sounds.
`src/lib/features.ts` exports `MUSIC` (`import.meta.env.PUBLIC_MUSIC === 'true'`); every entry point
checks it.

- **The music pages live in `src/routes/`, not `src/pages/`.** `astro.config.mjs` injects them only
  when the flag is on, so with it off they are real 404s. Don't move them. The homepage imports the
  shelf keychain behind `import.meta.env.PUBLIC_MUSIC === 'true'` spelled out (not `MUSIC`), so the
  build folds it away and a music-off build carries none of its art.
- **Music work happens on the `music` branch** (its own worktree, `../pressroom-music`), cut from
  `main` on 4 Oct 2026 so the music could ship without the reader work then waiting on
  `press-proof`. Later that day `main` caught up with `press-proof` (the reader work went out) and
  `main` was merged into `music`. Release = merge `music` into `main`. If `press-proof` gets ahead of
  `main` again with unreleased work, don't merge it into `music`: take `main` instead.
- With the flag off, the build also deletes `ost/` (the MP3s in `public/ost/`) from the output.
- Local work: `PUBLIC_MUSIC=true` in `.env`. Going live: set it in the Vercel project env and
  redeploy — no code change.

## `/music` — the rack, and the song catalogue

`src/data/songs.ts` is the catalogue: one entry per keychain, in rack order — slug, status
(`out` | `coming`), titles, data/audio/art stems, the copy-key prefix, the MV (YouTube id + offset),
the sky per movement (`moods`, with day/night for the star field), the falling-stars movement and
the lock-screen album. Timing (length, movements, lyrics, hits, wave) always comes from the song's
imported JSON. `src/lib/keychainServer.ts` resolves a song's data, art and keychain (QR →
`/music/<slug>?scan=1`).

- **`/music`** (`src/routes/music/index.astro` + `src/scripts/ost/rack.ts`): every song hangs on a
  metal rail as its keychain. Songs not out yet are **blank clear charms with a COMING sticker and no
  title** (Jun, 4 Oct; `keychainHtml(null)`, one layer per face so they are cheap). The markup waits
  in a `<template>` per stage and charms are hung one at a time when the page is quiet
  (`src/scripts/hangWhenQuiet.ts`), with a dashed outline holding each place. A tapped charm takes
  `view-transition-name: kc-hero` into the song page's keychain.
- **`/music/<slug>`** is the song page below; an unknown or coming slug returns an empty 404 (a
  rewrite to `/404` is forbidden — it is prerendered). **`/ost` 301s to `/music/starfall`** with its
  query, forever: links and any printed QR from before the move.
- Words: the `music` page group in `copyKeys.ts`. A new song's own words go under `song.<slug>.*`;
  STARFALL keeps its `ost.*` keys because Studio overrides are stored by key and `loadCopy()` drops
  unknown ones.

## `/music/starfall` — 「ナガレボシ · STARFALL」: a keychain you scan, then the playlist

The song's title is **ナガレボシ** (all katakana) and **STARFALL** — never the Thai title again (the
owner's call; the cover art itself still carries the old Thai lettering until it is redrawn).
A CD album and a spinning disc read as foreign to younger visitors, so the soundtrack is merch
they know: an **acrylic keychain**. `src/routes/music/song.astro` + `src/scripts/ost/song.ts` (one page
and script for every song; the song arrives as the `#song-data` payload), two views on one page
(`data-state` on `main`, mirrored in the URL):

1. **KEY** — the keychain hangs in the night (`src/lib/keychain.ts` markup, `src/styles/keychain.css`,
   physics `src/scripts/dangle.ts`): a **verlet ball chain** (`src/lib/rope.ts`, tested — 12 links
   pinned at the hook, folds when slack, straight when taut) with the charm a **pendulum on the
   jump ring**, driven by the ring's acceleration and tugging it back; a twist spring shows the
   back. Brushed by the pointer, held and flung, swayed by scrolling; nothing runs at rest. The
   **jump ring passes through the plate's hole in 3D** (turned ~58° inside the charm's preserve-3d
   context, so the acrylic depth-sorts it: threaded, not stuck on). The owner rejected a rigid
   chain that "looked like a rod" and a ring that "looked pasted on". Clear 5 mm plate, art on
   a white underlay, a **star holo** film — two screens of tiny four-point stars lit by rainbows
   that slide with the tilt, over faint diffraction lines (`--kc-hx/--kc-hy` from the physics), a **waveform "sound
   code"** (48 bars of the mix's accent energy) and, on the back, a **real QR** (the `qrcode`
   package, server-side only — `src/lib/keychainServer.ts`) that opens `/music/starfall?scan=1`. The design
   can go to print as it is.
2. **Scan** — tapping the wave (or SCAN): a viewfinder closes on the code, a line reads it, the
   bars light; a two-note chime only if SOUND is on. Then a **same-document view transition**
   (`html[data-vt='scan']`) opens the playlist in a circle out of the scanned point while the
   printed art flies to the playlist cover (`ost-art`) and the title to its title (`ost-title`).
   `history.pushState('?scan=1')`, so Back returns to the keychain (`unscan` shuts the circle).
3. **LIST** — the playlist: a compact line (small cover, title, PLAY for the song alone, scrubber
   with movement ticks), then **the MV, wide** (column width, never taller than 80svh), the 16
   movement cards under it, now playing (movement + karaoke choir line: JA with ruby and a per-chunk
   wipe, TH under it), the song list opening onto its 16 movements with liner notes (click seeks), the
   credits, the way back to the rack. `?scan=1` renders this view server-side (the QR's landing) with
   a brief SCANNED flash.

- **Sky per movement** in the LIST view (the song's `moods`, registered `@property` colours); the KEY view stays
  night. Stars are one fixed 2D canvas; accents brighten it; in **XIV. Starfall** strong accents
  launch falling stars. Reduced motion: still sky, still keychain, no finder animation.
- Every word around it is author copy — the `ost` page group in `copyKeys.ts` (keychain, playlist
  header, liner notes, MV, credits), trilingual, previewable in the Studio. So the page is
  `prerender = false` + `loadCopy()` + `cacheShell()`, like `/asu`.
- **The MV is the page's big thing** (Jun, 4 Oct: the night classroom with the four silhouettes
  "didn't work" and is gone, like the rabbit choir before it). Click-to-load: the poster is the MV's
  title frame, and ▶ sits above the title lettered across its middle; nothing loads from YouTube
  before that press. Then a YouTube IFrame API player (`src/scripts/music/youtube.ts`, youtube-nocookie)
  and **the page's one clock follows the video**: ScoreClock eases toward the player's time
  (`clock.toward`), which YouTube reports in steps, so between reports it runs on; after a seek it
  holds a moment, because the player still reports the old place. So the cards, karaoke, scrubber,
  sky, falling stars and mini transport all follow the video with no code of their own.
  - **Two sources, never together** (`source` in `song.ts`): PLAY (`data-play-song`) is always the song
    alone — pressed while the video plays, the video pauses and the MP3 goes on from the same moment;
    pressing play inside the YouTube player takes over from the MP3 the same way. The mini
    transport's button (`data-play-any`) pauses / resumes whichever is current. Seeks go to the
    current one.
  - **The card strip**: one card per movement (`public/ost/<slug>/cards/NN.webp`, the MV's own section
    cards, and the 384×216 copies the strip loads, `cards/thumb/` — `node scripts/card-thumbs.mjs
    <slug>`). The one playing is lit with a progress bar, and the strip scrolls itself to it unless the
    visitor touched it in the last 4 s or the mouse is over it. A card before anything has played
    starts **the video** there; afterwards it seeks whatever is current. The liner-notes entries do the
    same but start the song.
  - `mv.youtube` is the premiere Jun uploaded with v07j (`AFSvZn9lL0Q`, 4 Oct; it replaced `XpEp6WpBBC8`, the old choir and
    credits) — it won't play before 10.10 21:00 JST. To
    test the sync, swap in any embeddable id locally (`M7lc1UVf-VE`, the IFrame API's sample) and swap
    it back. A song with no `mv` has no video, just the strip.
- **Cover:** F2 of `music-repo/_work/cover_options` (Jun, 4 Oct) → `src/assets/ost/starfall-cover.jpg`;
  the video's poster is the MV's title frame (`starfall-screen.jpg`). The old Thai-lettered covers are
  gone from this branch.
- The MP3 (9.9 MB) is `preload="metadata"`; the full download starts when a visitor reaches for PLAY.
  `?t=<sec>` starts the clock there. Mini transport appears when the player is out of view.

### The data — `src/data/ost/<slug>.json`

Imported, never hand-edited: `node scripts/import-ost.mjs <slug> [--audio]`. Each slug's sources are
in `scripts/songs.import.mjs` (STARFALL: the MV player's `timeline.json` in
`../music/music-repo/visualizer/player2/songs/starfall-mv/`, the master in
`../music/starfall/final/`). It keeps only duration, movements, lyrics (chunks with kana), accent
hits, the keychain `wave`, and the motif's right hand (`motifMovement`, for `motif.test.ts`).
`--audio` copies the master to `public/ost/<slug>.mp3`. **The music project's notes name the
composer personally — none of that may reach this repo;** the importer copies no credits and no
title (titles are the catalogue's). Cover art is `src/assets/ost/<stem>-{night,day}.jpg` (3000²,
encoded through `astro:assets`); STARFALL's still carries the old Thai lettering until it is redone.

**Performance, measured (production build, Intel UHD 610, cold):** the charm's first raster cost a
~0.5 s frame. SVG images are rasterised on the main thread, so the star screens are **PNG mask
tiles** (`public/kc/stars-{a,b}.png`, regenerate with `node scripts/holo-tiles.mjs`) and the QR is
a **PNG** (`qrcode.toDataURL`, `image-rendering: pixelated`); no blurred inset shadows. What's left
is the GPU's one-off cost for many translucent 3D layers, so the shelf hangs its keychain only when
that can't be felt: after load, in view, ~1.8 s in, and not within 0.5 s of a scroll.

### The shelf keychain (`src/components/library/KeyChain.svelte`)

The soundtrack hangs from a hook at the end of the shelf after the books, on the same plank, with
the same markup and physics as `/ost`; `index.astro` passes its art and QR to `Library` as the
`ost` prop (null when music is off). Click goes to `/music/starfall`. The NOW PLAYING staff band and
the CD jewel case are **gone**.

## `/ost/tobira` — 「扉の向こう」 as a moving score (unlisted)

The previous soundtrack page, kept like `/lookbook`: nothing links to it. `src/routes/ost-tobira.astro`
with `src/scripts/ost/{main,score,render}.ts` and `src/data/ost/perd-pratu.json`.

- **Sync comes from the data.** A notehead is centred on its onset, so it touches the line exactly
  when it sounds; `ScoreClock` (`clock.ts`, shared with `/ost`) eases toward `audio.currentTime`.
- `score.ts` turns MIDI into notation (spelling against four flats, accidentals held to the bar,
  stems, beams); `render.ts` draws SMuFL glyphs on one canvas, metrics in staff spaces.
- Page-only faces in `src/styles/ost-fonts.css`: `'OST JP'` (its own subset — re-subset it when
  adding Japanese here), `'OST Dot'`, `'OST Notation'` (a renamed Bravura subset; OFL Reserved Font
  Name — never call it Bravura). See `src/data/ost/README.md`.
- `audioLen` (234 s) is the MP3's length, not the JSON's `duration`: the last chord rings on.

## UI sounds — the theme song under the pointer (`src/scripts/sound.ts`)

Notes of **ナガレボシ's motif** (the G–A♭–G cell) synthesised with Web Audio: triangle + a quiet sine
an octave up, one lowpass, 4 ms attack, short exponential decay. **No sample files.**

- **Off by default.** The switch is SOUND in the site header, and a SOUND row in the reader's
  settings panel. The choice lives in `localStorage['pr:sound']`, read at module load.
- The `AudioContext` is only created inside a gesture. `navigator.audioSession.type = 'ambient'`
  where supported. Silent in a hidden tab; ducked while `pr:music` says a song is playing.
  Both song pages (`data-no-sfx`) opt out entirely.
- **Hooks are attributes**, delegated from Base: `data-sfx="note"` (hover → the next note of the
  hook), `data-sfx="open"` (press → A♭maj7), `data-sfx="tap"`. Direct calls: page turn →
  `sfx.tick()`, ここすき → `sfx.sparkle()`, a correct lock password → `sfx.chord('unlock')`
  (Cm(add9), where the hook lands).
- `MOTIF` and `CHORDS` are hardcoded so no page needs the JSON to play a note.
  **`src/scripts/ost/motif.test.ts` checks them against `starfall.json`** — a re-export that moves
  the hook fails the test instead of drifting silently.

## The artist signature stamp

The vermillion box holding a single kanji is **retired**. The artist's own animated chibi doodle
(`stamp` / `stampStatic` in `src/data/showcase.ts`) now signs the shelf hero, the artist teaser, the
the `/asu` hero and every book's synopsis (the library author card that also used it is retired).
Animated WebP cannot be paused with
CSS, so each placement uses `<picture>` with the still frame under `prefers-reduced-motion`.

## The page reader's chrome (`ReaderChrome.svelte`, `ReadingGuide.svelte`, `lib/readerUi.ts`)

Readers didn't know where to tap (the 2026-10 UX audit, `doujin/.local-tools/pressroom-ja/ux-plan.md`):
that pages could be single or double, that the translation could be switched, that ここすき and the
bookmark existed, or where they were kept. So:

- **Every control in the top bar has its name under its icon, on every screen** (`.rc-tool`, labels
  11px — never smaller): ← 概要 (a 44px tool like the rest; the inline 「← 概要」 was a 39×17 target)
  · 翻訳 switch · 目次 (with chapters) · めくり/スクロール · ここすき · 一覧 (the page grid) · 拡大 (mouse
  only, below) · 全画面 (not on touch phones) · 設定 (a drawn gear; it was "AA", which read as text
  size) · 使い方. Phones (≤ 520px) drop the title and the note flag (the rail still shows the note)
  and get one mode button that draws both ways — book and scroll, the one in use lit — with its name
  under them (a lone 「めくり」 read like "turn the page"). JA holds one row at 360 and 390; an English
  bar at ≤ 420px shows ← ♡ ▦ gear ? 目次 as icons with their names in `title`/`aria-label` (it wrapped
  to three rows at 360) — the switch and the mode keep their words. `:hover` is pointer-gated.
- **拡大 — the page reader's zoom, visible** (`lib/readerUi.ts` `ZOOM_STEPS`/`zoomStep`, tested): the
  lettering is small on some screens and nobody found ctrl+wheel. FlipSurface exports `zoomBy` /
  `zoomFit` over its one existing zoom (pinch, ctrl/⌘+wheel) and reports the scale (`onZoom`). With a
  mouse the bar has − 「100%」 ＋ (the % goes back to the whole page); keys + − 0 (never with ctrl/⌘);
  phones keep pinch and get the same three buttons in 設定 → 表示. Steps 100–400 %, a press during the
  animation steps on from where it is headed. Zoomed in, drag (and wheel, sideways too) pans and a
  press never turns the page (the 'pan' gesture); ‹ › and the keys still turn, which resets it.
  Flip mode only — scroll mode has no zoom.
- **The address follows the page** (`readerSearch` in `lib/readerLink.ts`, tested): `?p=<page on
  screen>` by `history.replaceState` (400 ms after a turn — Safari refuses > 100 calls in 30 s), and
  `?n=`/`?ch=` dropped once used. The entry link outranks the saved place, so a reload (iOS reloads
  background tabs) sent the reader back to the page they came in on. Arriving by a link also saves
  the place at once (it waited for the first turn).
- **「このパートは小説です」** (`novelCardDue`, tested): on a page of a novel part whose text exists in
  the reader's language, a small card above the counter (not a wall — pages still turn) —
  「…日本語の本文は小説リーダーで読めます」 + 「小説リーダーで読む」 / 「このまま原本を見る」. Dismissed, or left
  behind by reading out of the part, it stays away for the session (`sessionStorage`
  `pressroom:novelcard:{workId}`); the compact 「小説で読む →」 link stays in the counter row.
- **The translation switch is a real toggle** (only when the book has bubbles): its label is its
  state, 「翻訳：日本語」 / 「原文：タイ語」 (`translationLabel`, tested; one shape for both, and the
  narrowest that fits). The old 「◫ 翻訳」 chip looked like a switch and did nothing.
- **設定 is three named sections**: 表示 (単ページ/見開き, めくり/スクロール, 紙のめくり（見開き） — shown in
  double layout only, 拡大 on touch screens, ページの合わせ方, 効果音), 翻訳 (on/off in the switch's words,
  翻訳の出し方 + explanation), 画面の言語（ボタンの表示） — readers took 言語 under 翻訳 for the
  translation's language. Then 「しおりについて」. The panel scrolls on a short screen. **A tap outside
  closes it and does nothing else** (a transparent scrim over the page and the bar — it used to turn
  the page and stay open); Esc closes it too. The novel reader's panels behave the same.
- **English labels are capitals throughout**: language names inside chrome labels go through
  `langLabel` (`lib/bookInfo.ts`, tested) — 「IN JAPANESE」, 「ORIGINAL: THAI」, 「THAI ONLY (NOT
  TRANSLATED)」, 「JAPANESE (NOVEL PART)」; mixed 「IN Japanese」 read as a mistake. Prose keeps
  `langName`. 目次 is CHAPTERS everywhere in English (it was TOC in the bars).
- **A phone held upright opens single pages** (`openingLayout`, tested; `NARROW_QUERY` is
  FlipSurface's own phone rule), whatever `works.default_layout` says; wide screens keep the
  default. A layout the reader picked in 設定 still wins — `ReaderSettings.layoutChosen` marks it,
  because settings are saved whole and a phone that once saved the work's 'double' default would
  otherwise keep it (`pickedLayout`, tested: a saved layout that differs from the default counts as
  a pick too — the picks made before the mark existed).
- **The bar stays up on a first visit until the first page turn** (`pinned`, hint key `bar`), then
  the 3 s auto-hide as before. **A tap in the middle third shows or hides it** (FlipSurface
  `onMenu` → `toggleMenu`; the outer thirds turn) — on a phone there was no way to bring the bar back
  without turning the page. What counts is whether the bar was away when the press began (the
  press itself wakes it). It works from the very first visit: a centre tap unpins the bar
  (`onUnpin`; the guide promised it and nothing happened until a turn). With a mouse, a centre click
  that hid it holds it hidden against the mouse's own small moves (`quietMoves`) — a press, a key or
  the pointer at the top/bottom edge brings it back — so a centre click toggles too.
- **The reading guide** (`ReadingGuide.svelte`, shared with the novel reader): four tips with drawn
  icons — tap left/right to turn (RTL-aware; scroll mode says scroll), the middle for the menu,
  設定 for layout/mode/translation, long-press for ここすき and where to find them (一覧 → ここすき).
  Shown once per reader type (`takeHint('guide-reader')`), then the page-corner peel; 「？ 使い方」
  reopens it. A tap anywhere or Esc closes it; `role="dialog"` + `aria-modal`, focus on the button,
  Tab stays there, focus goes back on close; the reader ignores keys while it is open. Reduced
  motion: no animation. The old first-visit toasts (mode, long-press) are gone — the guide says both.
  **With a mouse** (`(hover: hover) and (pointer: fine)`) the tips say クリック, ← → keys and ‹ ›, and
  設定's tip points at 拡大 (＋ key); on touch it mentions 拡大 and pinch. The card is centred by auto
  margins and the overlay scrolls, and on a short wide screen (a phone on its side) the tips go two
  across — centred by `place-items` its top was out of reach at 844×390.
- **No ‹ › on touch screens** (`@media (hover: none)` in FlipSurface): they floated over the page
  edge and blurred the margin notes. Mice keep them.
- **The first save says where it went**: the first page turn, or the first ここすき, toasts
  「…このブラウザに保存しました」 once per browser (hint key `saved`; scroll mode's mount report isn't a
  turn). **Every ここすき added also says where they live**: a second line 「「一覧」→「ここすき」で見られます」
  (the toast is `pre-line` and `width: max-content` — with `left: 50%` a shrink-to-fit box was capped
  at half the screen and wrapped every few characters). **Toasts sit under the top bar**, never over
  a control: at the bottom they covered the novel link and the counter on a phone.
- **The drawers (一覧, 目次) close four ways**: a visible 「× 閉じる」 in a sticky bar at their top (in
  reach however far the grid scrolls), a tap on the dimmed page beside them (the drawer is 82–84vw on
  a phone — the grid used to cover 92% with a 31px strip as the only way out), Esc, or their button.
  Focus goes to × on open and back to the bar's button on close. Esc also closes 設定.
- **「小説で読む →」 is a small pill in the page counter's row**, a real link (its tap area reaches
  44px through an invisible extension), shown only on pages of a novel part (`novelHere`, tested — a
  book whose chapters carry no kind keeps offering it everywhere) and only when the text exists in
  the reader's language; hidden while the 「このパートは小説です」 card shows. It sat in the bar on every
  page once, then as a pill above the counter that reached 28px into the page. The bottom bar is
  `minmax(0, 1fr)`: a long part title ellipsises instead of pushing ◀ RTL off the screen.
- **Deep links**: `?p=pageId` (thumbnails, parts, SHARE), `?ch=chapterId` — the start of a part
  (`partStart`), for the novel reader's last page — and `?n=66`, a page number (the timeline); the
  last two exist because a locked book's page rows are hidden. All win over saved progress, `p`
  first — which is why the address is kept on the page being read (above). A locked reader that
  can't unlock goes to the overview with `?go=` (the gate opens and brings the visitor back — see
  the overview section).
- The page-curl setting now reaches FlipSurface (it was passed to ScrollSurface, which has no such
  prop — 紙のめくり オフ did nothing). ScrollSurface's grid columns are `minmax(0, 1fr)`: in
  fit-height on a phone an auto track grew to a page's min-content and widened the document (and the
  fixed bar) by 15px.

## Translations — lettered into the balloons (`TypesetLayer.svelte` + `lib/typeset.ts`)

Bubbles (`pages.bubbles`) are drawn two ways; `ReaderSettings.translateMode` picks one. The bar's
switch turns the translation on and off (below); 設定 → 翻訳 picks 吹き出し / 訳文リスト (the notes
mode — renamed from 一覧, which is now the page grid's label) with a one-line explanation:

- **typeset** (default): the translation lettered into the balloon, vertical (縦書き) unless the box
  is wide or Latin. The fit is computed once in the page's pixels (`fitBubble`: `Intl.Segmenter`
  words, kinsoku, column length = the ellipse's chord at each column's outer edge, one book-wide
  base size snapped to steps ×1 … ×0.6, `TS.MIN` then overflow) and drawn in `cqh` of the layer, so
  nothing re-measures at any size or zoom. Columns are **top-aligned (天揃え) and the block is
  centred** in the balloon — in an ellipse the block is the rectangle inscribed at its width, the way
  Japanese lettering sits; per-column centring looked ragged (the owner's note).
  **`cover`** ([x,y,w,h] page fractions) paints out each patch of the original lettering — one patch
  per Thai text row, so it follows a curved balloon and leaves its outline; a balloon holding two
  Thai blocks is two bubbles, each with its own Japanese where its Thai was. Without `cover` the box
  gets the old soft balloon-shaped fill (hand-drawn bubbles in the Studio). `dark` for black
  balloons (black patches), `shape` ellipse/round/rect/none, `dir`, `scale`. All optional on the
  bubble — old bubbles just work. `normalizeBubble` validates. The vol. 1 translation's patches are
  measured from the page images by a private tool (doujin/.local-tools/pressroom-ja), not in this repo.
  Not interactive (no `data-bub`): taps turn pages, long-press still faves. The rail shows notes
  only in this mode.
- **notes**: the original hotspots + tooltips + the side rail.
- **Page turns carry the lettering**: the curl and cover overlays are CSS backgrounds, so FlipSurface
  clones the page's `.ts` layer (`inkOf`, boxed in % of the page) into the leaf, the still half and
  the pre-mirrored back (`CurlSetup.leafInk/staticInk/backInk`, `DoorSetup.ink`, `land.ink`).
  Without that the turning page showed Thai for the whole turn.
- A translated book opens translated when `work.translations` includes the reader's UI language
  (a reader who ever changed a setting keeps theirs — settings are saved whole).
- `kind: 'prose'` bubbles are skipped by the layer. Book 2's prose is not lettered onto page images:
  it is read as text in the novel reader (below).
- BubbleEditor: balloon/dark/direction/size per bubble, PREVIEW TYPESET, the fit readout
  ("1.70% · 3 COLUMNS" / TOO LONG), arrow-key nudges. Draw the box on the balloon's inside, not the
  tail.
- Fonts: `--font-typeset` = system mincho only, never the subset webfont.
- **Clean pages** (`supabase/clean-pages.sql`, `lib/cleanPage.ts`, tested): a page may carry
  `clean_path`/`clean_med_path`, the same page exported from the art file with no lettering. Under
  a typeset translation, and only when the page has bubbles, SheetImage draws that instead (the
  preload warms it too), and TypesetLayer gets `clean`: no cover patches, no soft fill. Thai mode,
  notes mode and the thumbnails keep the page. The curl/door clones read the loaded image's
  `currentSrc`, so a turning page carries the clean picture by itself. A check constraint keeps a
  clean path inside its own page's folder.
  **`cleanOnly` bubbles** put back marks that were lettering in the art file (an SFX, a 「!!!!!!」)
  and so vanish from the clean export; they are drawn only over the clean picture and never listed
  as lines. Find them by diffing the page against its export outside the lettered balloons (the
  private tool does).
- **IMPORT PREPARED FILES** (PAGES tab, `PreparedImport.svelte` + `lib/preparedImport.ts`, tested):
  pick a folder holding `manifest.json` (`{work, files: [{file, path, page?, column?}]}`); it is
  checked as untrusted input (this work's folder only, a page's file in that page's folder, no
  `..`, image types, no duplicates), then the files go up with the author's session (upsert, 1-year
  cache) and the clean columns are written per page once all its files are up. Also carries the
  novel's illustrations (`works/{id}/novel/…`). Paths are cached a year: a re-export needs new file
  names, not the same ones.

## The novel reader (`/w/[slug]/novel`, `NovelReader.svelte` + `lib/novel.ts`)

Book 2 is prose. Its text lives in `novel_sections` (`supabase/novel.sql`): one row per section per
language, `body` a list of blocks — `{t:'p', text, align?, bold?, italic?, box?, runs?}`,
`{t:'img', path, w, h}`, `{t:'gap', rule?}` — ordered by a `collate "C"` `sort_key`.
`works.novel_langs` is public so the overview can offer 「小説を読む」 (and the image reader its
chip) even while the book is locked.

- **The print's typography** (taken from the manuscript and its print PDF by the private tool):
  `italic` (the Thai's inner voice and written words — the Japanese carries that in its wording),
  `runs` = `[{text, i?, b?, size?}]` for partial italic/bold and the enlarged shouts (`size` in em;
  the runs must join to exactly `text` or `normalizeBlock` drops them), `box` = a document quoted
  in the story, framed (consecutive boxed paragraphs share one frame, `groupBoxes`), and
  `rule: 'line' | 'dots' | 'wave'` = a drawn scene break. A section may END on a rule gap.
- **In 縦書き none of it may leave the pitch grid**: a box's border + padding add exactly one
  pitch; a line with a larger run widens by whole pitches (`rowsFor`, `--rows`); every run has
  `line-height: 0` (a bold face's metrics alone widened a column 1 px and pushed the rest of the
  book off the grid); boxes and widened lines that would straddle a page edge move to the next
  page (`data-keep`, in `alignPageStarts`).

- **Locked works:** RLS hides the rows from anon; the reader calls `unlock_novel(work, password,
  lang)` (security definer, same check as `unlock_pages`) with the tab's saved password, else goes
  back to the overview. Never make the rows readable some other way — the whole book would be free.
- **縦書き is the book** (Japanese only, the default): one `vertical-rl` strip translated a page at a
  time. A page is the stage width rounded down to whole columns (`pagePitch`), every block keeps the
  line pitch (titles 2 lines + 1 empty column), and titles, pictures and おわり are pushed to the
  start of a page (`alignPageStarts`), so a turn never cuts a column and a picture is one page.
  Three things that broke it once:
  - the push is the physical **right** margin — a figure lays itself out `horizontal-tb` (so its
    picture's max size resolves against a definite box; in the vertical grid it overflowed the
    page), where `margin-block-start` would mean its top;
  - `layout()` sets `--step` on `.nv` itself before measuring — Svelte writes the style attribute
    only afterwards, and the first measure saw 1px-wide figures;
  - a remainder of ≤ 2px past a page edge is rounding, not a column (padding it left a blank page).
  Tap thirds / keys / swipe right = forward; ‹ › buttons with a mouse, kept clear of the text.
- **Its bar names its tools like the page reader's**: 目次 · 設定 (a gear; it was "Aa") · 使い方, and
  its own reading guide (`takeHint('guide-novel')`; 縦書き: tap left third = next, centre = menu,
  設定 for 縦/横 + size + 明朝/ゴシック, 目次 — 横書き swaps the first two for "scroll; your place is
  saved"). 設定 ends with 「しおりについて」; the first page turned (or scrolled by the reader, not by
  a resume or a 目次 jump — `quietUntil`) toasts that the place is saved in this browser, once.
- **The place carries its chapter's number** (`{section, block, chapter}` under `placeKey`, see the
  overview): the overview and the shelf say 「続きから読む（第三話）」 / 「小説しおり 第三話」 without
  reading a locked book's text. `parsePlace` ignores the extra field.
- **A finished book is kept as finished** (`end: true`, `placeAtEnd`, tested): the last page holds no
  paragraph, so nothing was saved there and Back from the manga landed a page short (144 / 145) — now
  the last block is saved with `end`, and the reader opens on the last page again (both modes;
  switching 縦/横 on it keeps it).
- **`?s=<section index>`** (`sectionParam`, tested) opens at that section — the overview's chapter
  list uses it — once: it is removed from the address straight away, so a reload resumes the saved
  place.
- **縦→横 keeps the place**: `blockEl` looks in the whole reader (`root`), not in the vertical strip —
  after the switch the strip was gone and the reader landed on the title page at 0 % (横 resume and
  目次 jumps were broken the same way).
- **Its bar and 設定 match the page reader's**: 44px tools with their names under the icons (← 概要 ·
  目次 · 設定 · 使い方; they were 28px text buttons), 設定 in named sections — 表示 (文字の向き 縦書き/横書き,
  文字サイズ, 書体) and 画面の言語 — then 「しおりについて」 in its novel wording (`BookmarkNote kind="novel"`:
  a place only — no ここすき in the novel). A tap outside a panel closes it (scrim), Esc too.
- `.nv` pins its one column to `minmax(0, 1fr)`: an auto column grew to the bar's min-content (back +
  title + labelled tools) and the page pitch, measured from it, came out wider than a phone.
- **The last page belongs to the book** (`novelSequel`, tested): when the book also has a manga part,
  「第一部 おわり」 (vertical in 縦書き) and a button 「第二部 マンガ『大人の重荷編』へ →」 to the page reader
  at that part's start (`?ch=`), then 「概要に戻る」 — readers finished the novel not knowing the
  manga continued it. Chapters are read for this (public even when locked); without both kinds it
  is a plain おわり. In 縦書き the end is a whole page laid out across, like a figure.
- **横書き** is a plain scroll, and the only mode for Thai and English. Thai is set in Noto Serif Thai
  (see Languages); the 明朝/ゴシック choice is hidden for Thai.
- Settings (direction, 3 sizes, mincho/gothic) in `pressroom:novel-settings`; the place per work and
  language in `pressroom:novel:{workId}:{lang}` — the first block that *starts* on the page, so a
  paragraph carried over doesn't bring a reload back a page.
- `tcyPieces` sets 1–2 digit numbers and !? / !! upright; longer numbers in the Japanese text are
  written in kanji (五二三九〇), as a vertical book would.
- Test harness (private, doujin/.local-tools/pressroom-ja/novel-review.mjs): mocked work, rows and
  RPC, screenshots at 1440 and iPhone 13, and checks for cut lines, figures spanning pages, resume,
  reduced motion and the locked flow. Never the real DB, never a password.

## Gotchas

- **Delayed navigations: use `navigation.navigate()`, not `location.assign()`.** Verified in real
  Chrome: from a `setTimeout`, `location.assign` gets no cross-document view transition (the page
  wipe silently disappears) while `navigation.navigate` keeps it. Headless/Playwright Chromium
  never runs the reveal side of a view transition at all — test transitions in real Chrome.

- **The sanitizer keeps `class` on `<span>` for the highlight spans only** (`hl`, `hl--v`,
  `hl--g-*`). It used to allow `class` on `<figure>` alone, which silently stripped the gradient
  highlight the page copy is built around the first time the author pressed Save. If you touch
  `ALLOWED_SPAN_CLASSES` in `src/lib/richtext.ts`, keep `richtext.dom.test.ts` passing — that
  regression is invisible until someone notices their highlights vanished.
- **Safari cannot encode WebP** via `canvas.toBlob` — the uploader probes once and falls back
  to JPEG. Prefer uploading PDFs from Chrome/Edge desktop.
- Page order uses **fractional index keys** (`fractional-indexing`): a reorder is one row
  UPDATE — never renumber all pages.
- **Every `sort_key` column is `collate "C"`, and that is load-bearing.** The keys are ASCII
  base62 and `generateKeyBetween()` produces them in *byte* order, but Postgres here defaults to
  `en_US.UTF-8`, which compares letters case-insensitively first — so `'aa'` sorts **before**
  `'aZ'`. Once keys pass `aZ` the two orderings diverge: the client reads the wrong row as "last",
  asks for the key after it, and gets one that already exists. Symptom is a hard stop, not a flake
  — *every* subsequent insert fails with `duplicate key value violates unique constraint
  "…_sort_key_key"`, and the list is mis-ordered besides. This bit `artworks` at 37 pieces.
  If you add another fractionally-indexed table, pin the collation on the column.
- Forced spreads share a `spread_pair_id` uuid on exactly two page rows; the reader's
  `resolveSheets()` joins them in every layout mode.
- Storage paths are immutable (`works/{work_id}/{page_id}/…`, `cacheControl` 1 year) —
  reordering pages never touches storage.
- **The shelf's book grid is still `client:only`, and must open at its final height.** The fallback
  (`index.astro`, before hydration) and Library's own loading state render the same placeholders
  (`src/styles/shelf-ph.css`): the shelf head, the hidden hint line, and one stage + label per
  item, counted on the server (`library_cards()` + the keychain). Book and keychain labels have a
  fixed `--shelf-label-h`. Measured: fallback, loading and real shelf are the same height (745 px
  desktop, 952 px at 390) — this used to be a ~480 px jump (CLS 0.09), the stutter on entry.
  Change the numbers in `shelf-ph.css` with Library's. `Library.svelte` still registers
  ScrollTrigger at module scope, which is why it isn't SSR'd.
- **`src/styles/motion-kit.css`** holds small class-triggered motions adapted from
  `yui540/css-animations` (MIT — keep the licence header). Used for the library/reader/uploader loaders
  (`.mk-loader`), the lock gate (`.mk-brake` on a wrong password, `.mk-rollup` on unlock), and the card
  pop/arrow hop. Everything lands on its final state under reduced motion.
- **"ここすき" favourite pages** (idea and `HeartBurst.svelte` adapted from `yui540/comimi`, MIT):
  long-press a page (500 ms, cancelled by >10px movement, a second finger or a scroll) → heart burst,
  saved per work in localStorage (`loadFavorites`/`saveFavorites`). The chrome heart toggles the
  current sheet. The reading guide teaches the long-press (it used to be one 2.6 s toast). **FlipSurface treats a hold of 450 ms or more as not-a-tap** — without that guard a
  long-press also turned the page. Don't remove it.
- **Page grid** (一覧 in the chrome, ▦ icon): every page, a favourites tab, and SHARE, which copies the
  `?p=pageId` deep link. Jumps go through `Reader.jump()`, which scrolls the row in scroll mode —
  ScrollSurface reads its start index only at mount, so a bare `setCur` did nothing there.
- Chrome icons are inline SVG: the subset mono webfont has no ♥/▦ glyphs.
- The chrome hides after 3 s idle; never while a panel is open, focus is inside it, or before a
  first-time reader's first page turn. A tap in the middle third shows/hides it (see the chrome
  section).
- **Page curl** (`src/scripts/curl.ts`, geometry tested in `curl.test.ts`): in flip mode a one-sheet
  turn at 1x — drag, tap or ‹ › — is drawn as a paper fold. **Only overlays move**: the track jumps
  to the target sheet underneath, and absolutely-positioned copies of the current page rects fold
  over it (front clipped at the fold, the folded part reflected across the fold line with a
  drop shadow; on spread→spread the back is the target's facing page, pre-mirrored so it lands
  the right way round; otherwise it is the paper's reverse with the print showing through).
  The real `.si` boxes and their iOS width calc are never touched. Falls back to the slide for
  jumps, zoom > 1, reduced motion, unloaded images, or the PAGE CURL setting off
  (`settings.curl`, default on — it means "curl for spreads": 設定 shows it in double layout only).
  The long-press guard is unchanged.
- **One page on screen slides; spreads curl** (`turnStyle` in `lib/readerUi.ts`, tested). Single
  layout (phones) — including a forced spread shown there — and a lone page in double layout turn
  as a plain horizontal slide in reading direction (RTL: the next page comes in from the left),
  following the finger on a drag. The door swing that turned single pages (2026-10-04) looked odd on
  a phone (the owner, 2026-10-05). Double layout keeps the spread curl and the closed cover's
  opening (`Door` with `land`, below); reduced motion jumps. The plain `Door` (fade past 100°) and
  `doorAngle`/`doorCommit` stay in `curl.ts`, tested, used only by the cover now.
- **A turn asked for while one is drawn is never dropped** (FlipSurface `queued` + `Curl/Door.hurry()`):
  a tap or ‹ › during a curl lands the running one on its next frame and then turns again — taps
  300 ms apart used to lose every other one (6 taps → 3 pages).
- **The black page (2026-10-05, vol. 1 p.18 on an iPhone)**: root cause in FlipSurface, reproduced in
  WebKit (iPhone 13) and Chromium. `onPointerDown` stopped the track's slide (`killTweensOf`) on every
  press, before knowing what the press was; a press that turned out to be a centre tap (menu), a
  long press (ここすき) or a vertical swipe never restarted it, so the track stayed **between two
  sheets — on the empty dark floor** — until the next turn; switching to scroll remounted it. Slides
  ran where the door refused: on a phone, going back from p.20 onto the p.18–19 forced spread (single
  layout shows it as one two-page sheet), and on every first placement, which slid from sheet 0
  across all the unmounted sheets before it (a deep link to p.18 crossed 17 black screens, and a
  tap then froze it there). Now a press only takes the track when it becomes a horizontal drag, any
  gesture that ends without a turn puts it back (`settleTrack`), and the first placement, a resize
  or a jump of more than one sheet is set at once, never slid.
- **A page is never a black box** (`SheetImage`, `bust`/`LOAD_TIMEOUT` in `lib/readerUi.ts`): `.si` is
  paper, not #101012; while the picture loads the blurred thumbnail sits on paper with a small loader
  (after 350 ms, so quick loads don't flash it; the typeset lettering waits for the picture); a failed
  load (error, or an eager picture still loading after 30 s) is retried once with `?r=1`, then the page says
  「画像を読み込めませんでした」 with 「再読み込み」 (`data-nav`, so the tap isn't a page turn). Each picture ×
  attempt is its own `<img>` (`{#key}`), so the clean swap or a retry starts from loading instead of
  inheriting "loaded"; `decode()` and `complete` back up Safari's skipped load event. The preload
  `<link>`s now keep only the ±2 window (they piled up for every page read).
- **The book opens on its front cover, not the wraparound** (`src/lib/coverCrop.ts`, tested). The
  cover page is the whole wraparound and `works.cover_crop` marks the front; the reader used to
  show the whole sheet, so the first door turn hinged on the far edge of the back cover (the owner
  caught it on a phone). Now, when the first leaf is `cover_page_id` and the crop is a real
  wraparound front (`wrapBack`: hugs one edge, >30 % left over — the same rule the shelf's 3D book
  uses for its back cover; a mere framing crop leaves the page whole), the page becomes the front
  (`frontOnly`: width/height in the crop's pixels, translation boxes moved onto it, `crop` kept).
  SheetImage draws it in `.si__crop` (the contain rect, picture scaled and shifted inside), the
  curl/door overlays take each page as a CSS background layer (`pictureLayer`) over the crop's own
  contain rect, and the ▦ grid / chapter thumbs aim `object-position` at the front. The turning
  page is now the sharp `.si__img` once loaded — it used to grab the first `<img>`, the blurred
  thumbnail.
  **The front is trimmed to the first inner page's shape** (`frontOnly(page, crop, inner)`): the
  crop carries the spine and bleed, so the real fronts are 2–4 % wider than the pages (0.741 vs
  0.719) and the cover changed size as it opened and closed (the owner caught it). Spare width
  comes off the spine side (the edge beside the back — no lettering there on either book), spare
  height evenly off head and tail; more than `MAX_TRIM` (12 %) is the author's framing and is kept.
- **In double layout the solo cover is the book CLOSED** (`closedCover` in `FlipSurface`): it is
  one page wide and sits on its half of the spread — its spine on the spread's spine (RTL left of
  it, LTR right), an invisible `.fs__gap` sized like a page holding the other half. The owner found
  the centred, full-size cover wrong: on a phone it was twice the width of a spread page and its
  spine missed the book's. Opening it is a door with `land` (`curl.ts`): one sheet with the
  facing page on its back, turning the full 180° (`COVER_MAX`) and landing exactly on that page
  (`landingPage` picks it across the spine; at 90°, edge-on, the leaf trades the cover's box for
  the page's — `mirrored`); until then that half shows the reader's floor, like a closed book on
  a table. Closing runs it backwards. Single layout slides (above). Tested geometry in
  `curl.test.ts`; harness frames checked on desktop and a 390-wide phone.
- Reader harness (scratchpad, not in the repo): Playwright `page.route` serves a fake unlocked
  6-page book (works/pages/chapters REST + generated page images) — never the real DB, never a
  password. The UX harness (`ux-audit/lib.mjs`, `ux-phase1/run.mjs`) mocks both real books, vol. 2
  split into its two parts, at iPhone 13 / 360 / 1440×900. `ux-1b/` adds vol. 1's real forced
  spreads (p.18–19, 48–49, 58–59), its lettered pages served locally so a picture can be slowed or
  failed per request, and **Playwright WebKit** with the iPhone 13 profile (`npx playwright install
  webkit` in the doujin tool folder) — the black page reproduced there, and in Chromium.
