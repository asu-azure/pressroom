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

**Server-side reads are permitted for `<head>` metadata, for `/asu`'s content, and for the
homepage artist teaser.** Metadata: public work fields, so a shared link previews with its real
title and cover (crawlers never run the island). `/asu` is content-bearing — the page's whole job
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
- Cards and tiles: hairline border, 12px radius, the whole card lifts 4px and takes an accent frame
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
- **The gallery is a masonry grid** (CSS columns), not the drag strip it started as: nineteen
  pieces in one horizontal track meant hundreds of rem of dragging, and an illustrator's work runs
  0.36 to 1.34 aspect, so nothing is cropped. `.tile--natural` is the modifier that undoes the
  base `.tile`'s 4/5 crop — don't change `.tile` itself, the library cards borrow from it.
  Featured leads at `column-span: all`, constrained by width so it too stays uncropped.
- **`displayOrder`, not sort order, drives the lightbox.** Featured is pulled to the front of the
  grid, so indexing the manifest by `sort_key` would make the counter disagree with the number
  printed on the tile that opened it.
- `featured` is exclusive — the page leads with that piece and the toggle unsets the others.
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

## `/ost` — the main theme as a moving score

「扉の向こう」 Main Theme, the book's song, played as a grand staff that scrolls past a playhead
in time with the MP3. **It is its own theme and leaves the rest of the site alone.** It opens as
a Shibuya-style CD-single jacket (obi, vertical title, a barcode drawn from the score's
density). From there the scene follows the song: paper for most of it, ink for the Beethoven
section, Akihabara neon/CRT for the 8-bit duet, a night stage for the final chorus, and paper
again for the coda. `MODE_BY_SECTION` in `src/scripts/ost/main.ts` is the switch. Prerendered,
with no database.

- **Sync comes from the data, not from animation timing.** `src/data/ost/perd-pratu.json` was
  exported from the same source that rendered `public/ost/perd-pratu.mp3`. A notehead is centred
  on its onset, so it touches the line exactly when it sounds. The clock (`ScoreClock` in
  `src/scripts/ost/clock.ts`, shared with the homepage player) runs on `performance.now()` and
  eases toward `audio.currentTime` every frame. If the audio fails, it keeps running silently.
  See `src/data/ost/README.md` to swap in a new mix.
- `audioLen` in `ost.astro` is the MP3's length (234 s), deliberately not `duration` from the
  JSON (233.7 s): the last chord rings past the final note-off.
- `?t=<sec>` resumes there ("RESUME FROM 0:52" on the gate). The homepage player links with it.
- `score.ts` turns MIDI into notation: staff, step, spelling against four flats, accidentals held
  to the end of the bar, chords, stems, beams. `render.ts` is one canvas using SMuFL glyphs. All
  its metrics are in staff spaces, taken from Bravura's metadata.
- **Sound is opt-in.** Nothing plays until a gate button is pressed. That press unlocks the
  element, then a 1.6 s pre-roll lets the first notes scroll in before t = 0.
- **The MP3 (4.7 MB) is `preload="metadata"`.** The full download starts when a visitor reaches
  for a gate button (pointerenter / focus / pointerdown), so a visitor who only looks at the jacket
  never pays for it.
- Page-only faces are declared in `src/styles/ost-fonts.css`: `'OST JP'`, `'OST Dot'` and
  `'OST Notation'`. The JP face is a **separate subset** from the site-wide Noto, so adding
  Japanese to `/ost` means re-subsetting that file, not the global one. The notation font is
  Bravura (OFL, Reserved Font Name). The subset is therefore renamed, so never call it Bravura.
- Reduced motion drops the pop, particles, glitch, wipe and banners. The score still scrolls,
  because the moving score is the content.
- Entry points: the `NOW PLAYING` band on the shelf, `OST ♪` in the footer and in the site header. `/ost` itself has no site header (`topbar={false}`); its own HUD
  carries the way back.

### The homepage player (`src/components/NowPlaying.astro`)

The first eight bars of the chorus (window read from the JSON at build) on a short ink band between
the showcase and the shelf. Same renderer in its `mini` layout (grand staff sized to the band; no
rehearsal boxes, stop hatching or quote brackets), same clock.

- **Nothing heavy loads with the page.** `mini.ts` dynamically imports `score`, `render` and the
  JSON when the band is within 200 px of the viewport or a visitor reaches for ▶; the notation font
  is requested at the same moment. The MP3 is `preload="none"` until ▶. An inline SVG staff stands
  in until the first frame, so first paint is complete without JS.
- The song does not survive navigation (that needs an SPA router, which would break the module-scope
  GSAP/Lenis setup and the islands). `FULL SCORE →` hands `/ost` the current time via `?t=`, and
  `pagehide` pauses the element.
- While it plays it dispatches `pr:music` (detail `true`/`false`) on `document`; the UI sounds duck.

## UI sounds — the theme song under the pointer (`src/scripts/sound.ts`)

Notes of 「扉の向こう」 synthesised with Web Audio: triangle + a quiet sine an octave up, one lowpass,
4 ms attack, short exponential decay. **No sample files.** Budget is a couple of KB.

- **Off by default.** The switch is SOUND in the site header, and a SOUND row in the reader's
  settings panel (the reader has no header). The choice lives in `localStorage['pr:sound']` and is
  read at module load, so an island and Base agree whichever script runs first.
- The `AudioContext` is only created inside a gesture (the switch click). If sound was left on, the
  first `pointerdown`/`keydown` resumes it; hovers before that are silent — browsers require it.
  `navigator.audioSession.type = 'ambient'` where supported (iOS silent switch, no interrupting the
  visitor's own music). Silent in a hidden tab; ducked while `pr:music` says a song is playing.
  `/ost` (`data-no-sfx`) opts out entirely.
- **Hooks are attributes**, delegated from Base, so Svelte islands need no imports:
  `data-sfx="note"` (mouse hover → the next note of the hook; sweeping across the shelf plays it,
  and it resets after 2.5 s of quiet), `data-sfx="open"` (press → D♭maj7), `data-sfx="tap"`
  (click → one soft note). Space-separated: shelf cards are `data-sfx="note open"`. Direct calls:
  the reader's page turn → `sfx.tick()` (thinned to 4/s in scroll mode), the ここすき burst →
  `sfx.sparkle()`, a correct lock password → `sfx.chord('unlock')`.
- `MOTIF` and `CHORDS` are hardcoded so no page needs the JSON to play a note.
  **`src/scripts/ost/motif.test.ts` checks them against `perd-pratu.json`** — a remix that moves
  the chorus fails the test instead of drifting silently.

## The artist signature stamp

The vermillion box holding a single kanji is **retired**. The artist's own animated chibi doodle
(`stamp` / `stampStatic` in `src/data/showcase.ts`) now signs the shelf hero, the artist teaser, the
the `/asu` hero and every book's synopsis (the library author card that also used it is retired).
Animated WebP cannot be paused with
CSS, so each placement uses `<picture>` with the still frame under `prefers-reduced-motion`.

## Gotchas

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
- **The shelf's book grid is still `client:only`**, so the cards are not server-rendered. Until it
  hydrates, its `fallback` slot in `index.astro` shows six aspect-locked blank cards, so the page
  below doesn't jump when the books arrive. That is a
  known deferral, not an oversight: `Library.svelte` registers ScrollTrigger at module scope and
  would need auditing before it could SSR. The hero, showcase strip and artist teaser around it are
  static HTML, so the page is no longer content-empty on first paint.

## Reader extras and the motion kit

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
