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
   `scenes.sql`.
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
- **付箋 & しおり** (`src/lib/shelfmarks.ts`, tested): the reader also saves progress and ここすき
  favourites as *positions* (`pressroom:shelfmarks:{workId}` = total / at / favs), because the shelf
  can't map page IDs to order — locked works hide their page rows from anon reads. The book then
  shows a sticky tab out of the fore-edge per favourite (by depth, walking down 5 slots, max 12) and
  a bookmark card out of the head at the page being read; the label adds "しおり p.N · ♥ n".
  Re-read on `pageshow` (bfcache) and `storage`. Only ever this visitor's own browser data.

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

**Everything musical is off in production** until the owner launches it: `/ost`, `/ost/tobira`,
the soundtrack keychain on the shelf, the `OST ♪` links, the SOUND switch and the UI sounds.
`src/lib/features.ts` exports `MUSIC` (`import.meta.env.PUBLIC_MUSIC === 'true'`); every entry point
checks it.

- **The song pages live in `src/routes/`, not `src/pages/`.** `astro.config.mjs` injects `/ost` and
  `/ost/tobira` only when the flag is on, so with it off they are real 404s. Don't move them.
- With the flag off, the build also deletes `ost/` (the MP3s in `public/ost/`) from the output.
- Local work: `PUBLIC_MUSIC=true` in `.env`. Going live: set it in the Vercel project env and
  redeploy — no code change.

## `/ost` — 「ナガレボシ · STARFALL」: a keychain you scan, then the playlist

The song's title is **ナガレボシ** (all katakana) and **STARFALL** — never the Thai title again (the
owner's call; the cover art itself still carries the old Thai lettering until it is redrawn).
A CD album and a spinning disc read as foreign to younger visitors, so the soundtrack is merch
they know: an **acrylic keychain**. `src/routes/ost.astro` + `src/scripts/ost/starfall.ts`, two
views on one page (`data-state` on `main`, mirrored in the URL):

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
   package, server-side only — `src/lib/keychainServer.ts`) that opens `/ost?scan=1`. The design
   can go to print as it is.
2. **Scan** — tapping the wave (or SCAN): a viewfinder closes on the code, a line reads it, the
   bars light; a two-note chime only if SOUND is on. Then a **same-document view transition**
   (`html[data-vt='scan']`) opens the playlist in a circle out of the scanned point while the
   printed art flies to the playlist cover (`ost-art`) and the title to its title (`ost-title`).
   `history.pushState('?scan=1')`, so Back returns to the keychain (`unscan` shuts the circle).
3. **LIST** — the playlist: art, title, PLAY, scrubber with movement ticks, now playing (movement +
   karaoke choir line: JA with ruby and a per-chunk wipe, TH under it), the song list (one song
   now) opening onto its 16 movements with liner notes (click seeks), the MV, the credits.
   `?scan=1` renders this view server-side (the QR's landing) with a brief SCANNED flash.

- **Sky per movement** in the LIST view (`MOODS`, registered `@property` colours); the KEY view stays
  night. Stars are one fixed 2D canvas; accents brighten it; in **XIV. Starfall** strong accents
  launch falling stars. Reduced motion: still sky, still keychain, no finder animation.
- Every word around it is author copy — the `ost` page group in `copyKeys.ts` (keychain, playlist
  header, liner notes, MV, credits), trilingual, previewable in the Studio. So the page is
  `prerender = false` + `loadCopy()` + `cacheShell()`, like `/asu`.
- **MV**: click-to-load YouTube facade; `MV_YOUTUBE_ID` at the top of `ost.astro` is a **stand-in
  cut** — swap it and the `ost.mvKicker` copy when the final MV is up. Either player pauses the other.
- The MP3 (9.9 MB) is `preload="metadata"`; the full download starts when a visitor reaches for PLAY.
  `?t=<sec>` starts the clock there. Mini transport appears when the player is out of view.

### The rabbit choir (`src/components/ost/Choir.astro` + `src/scripts/ost/choir.ts`)

Four rabbits — S A T B, bass the biggest — stand in the player's corner and pop up on the first
PLAY. Everything they do comes from `starfall.json` `choir` (every note of each voice as
`[t0, t1, midi, vowel, kana]`; kana only where a syllable starts, `~` for a hum): each opens its
mouth on its own notes in the vowel's shape (a i u e o, closed 'n'), staying open through
breath-sized gaps; **a speech bubble shows the syllable it is singing** (♪ for a hum) and the
syllable floats up in its colour (pooled, ≤ 20) — the owner couldn't tell what they sang before.
Heads lift with pitch, scores rise a bar before the part, they sway with the accents and blink.
**Every pose is eased per real frame time, never set outright** — setting values directly (beat
spikes, head pops, the mouth snapping shut between syllables) made the first version judder.
Seeks re-find each voice's place instead of replaying notes. Reduced motion: mouths and bubbles
still change, nothing sways, lifts or floats.

**The drawing is temporary SVG, made to be replaced by Asu's art.** The rig is the contract — keep
the group classes and pivots listed at the top of `Choir.astro` (`.rb__all`, `.rb__head`,
`.rb__ears`, `.rb__eyes`, `.rb__mouth` with one child per `data-m` shape, `.rb__book`,
`.rb__emit`) and new art drops in with no script change.

### The data — `src/data/ost/starfall.json`

Imported, never hand-edited: `node scripts/import-ost.mjs [--audio]` reads the MV player's build
(`../music/music/visualizer/player2/songs/starfall-mv/timeline.json`) plus the vocal folder's
`choir_events.json`, and keeps only duration, movements, choir lyrics (chunks with kana), accent
hits, the keychain `wave`, the choir's notes per voice with the vowel sung (`choir`, for the
rabbits — `scripts/kana-vowel.mjs`), and the motif's right hand. `--audio` copies the MP3 to
`public/ost/starfall.mp3`. **The music project's notes name the composer personally — none of that
may reach this repo;** the importer copies no credits and sets the title itself.
Cover art is `src/assets/ost/starfall-{night,day}.jpg` (3000², encoded through `astro:assets`).

**Performance, measured (production build, Intel UHD 610, cold):** the charm's first raster cost a
~0.5 s frame. SVG images are rasterised on the main thread, so the star screens are **PNG mask
tiles** (`public/kc/stars-{a,b}.png`, regenerate with `node scripts/holo-tiles.mjs`) and the QR is
a **PNG** (`qrcode.toDataURL`, `image-rendering: pixelated`); no blurred inset shadows. What's left
is the GPU's one-off cost for many translucent 3D layers, so the shelf hangs its keychain only when
that can't be felt: after load, in view, ~1.8 s in, and not within 0.5 s of a scroll.

### The shelf keychain (`src/components/library/KeyChain.svelte`)

The soundtrack hangs from a hook at the end of the shelf after the books, on the same plank, with
the same markup and physics as `/ost`; `index.astro` passes its art and QR to `Library` as the
`ost` prop (null when music is off). Click goes to `/ost`. The NOW PLAYING staff band and the CD
jewel case are **gone**.

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
  current sheet. **FlipSurface treats a hold of 450 ms or more as not-a-tap** — without that guard a
  long-press also turned the page. Don't remove it.
- **Page grid** (▦ in the chrome): every page, a favourites tab, and SHARE, which copies the
  `?p=pageId` deep link. Jumps go through `Reader.jump()`, which scrolls the row in scroll mode —
  ScrollSurface reads its start index only at mount, so a bare `setCur` did nothing there.
- Chrome icons are inline SVG: the subset mono webfont has no ♥/▦ glyphs.
- The chrome hides after 3 s idle; never while a panel is open or focus is inside it.
- **Page curl** (`src/scripts/curl.ts`, geometry tested in `curl.test.ts`): in flip mode a one-sheet
  turn at 1x — drag, tap or ‹ › — is drawn as a paper fold. **Only overlays move**: the track jumps
  to the target sheet underneath, and absolutely-positioned copies of the current page rects fold
  over it (front clipped at the fold, the folded part reflected across the fold line with a
  drop shadow; on spread→spread the back is the target's facing page, pre-mirrored so it lands
  the right way round; otherwise it is the paper's reverse with the print showing through).
  The real `.si` boxes and their iOS width calc are never touched. Falls back to the slide for
  jumps, zoom > 1, reduced motion, unloaded images, or the PAGE CURL setting off
  (`settings.curl`, default on). The long-press guard is unchanged.
- **A single page turns like a door, not a fold** (`Door` in `curl.ts`): with one page on screen
  a fold has no facing page to land on and ends as a loose sheet in the dark margin — the owner
  found that strange. So the leaf rotates on its spine edge (left for LTR, right for RTL) under
  perspective, front darkening, a shadow on the page below, fading out past 100°; going back, the
  previous page swings in from the spine. Spreads keep the fold. `doorAngle`/`doorCommit` tested.
  **Test on a real iPhone before trusting it** — the harness is desktop Chromium.
- Reader harness (scratchpad, not in the repo): Playwright `page.route` serves a fake unlocked
  6-page book (works/pages/chapters REST + generated page images) — never the real DB, never a
  password.
