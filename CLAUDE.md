# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Pressroom** — a doujinshi (self-made manga) library + reader for illustrator **Asu Azure**,
plus that artist's own profile and art gallery (`/asu`, merged in from the retired `asu-art`
one-pager). The author uploads works as PDF (import-only: pages are rasterized to WebP in the
browser at upload time), arranges pages (drag-drop order, RTL/LTR, forced two-page spreads), and
attaches margin notes readers can see. Readers browse a public library and read with their choice
of single/double layout and scroll/flip mode. Public read, author-only write.

**The visitor journey is shelf first, artist second.** `/` is the bookshelf; three entry points
lead to `/asu` (a cream teaser spread, an "author card" as the last card in the grid, and a footer
link), and the trip plays the bird-flock wipe. `/asu` always offers a route back.

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

## Design system (inherited "Editorial FUI")

- Tokens & utilities live in `src/styles/global.css` (CSS custom properties — reuse, don't
  hardcode). Signature spreads `.spread--ink` / `.spread--paper` flip the semantic tokens.
  **`motion.css` loads after `global.css` and re-declares both spreads at equal specificity,
  so it wins the cascade.** Its values now read the `--paper-*` / token names with literals only
  as standalone fallbacks; if you retone a spread, check that file too or your token edit will
  appear to do nothing.
- **Paper is a Thai school notebook, not cream proof-sheet.** Faintly blue-white stock
  (`--paper-bg`), blue horizontal ruling (`.paper-grid`), red margin rule down the gutter. Red
  (`--rule-red`) is *paper stock* — the margin rule and the registration mark only. It is never
  an interactive or brand colour: the accent is still cobalt and the warm counterpoint is still
  amber, so the rule below is unchanged for everything that is not ruled paper.
  **Lines only — no grid.** The vertical grid was dropped; next to the red margin rule it read
  as one system too many.
- **Long-form prose rules itself.** `.paper-grid` is `inset:0` on its section, so its rules start
  at the section edge — an unknowable distance above the first baseline — and any pitch that
  disagrees with the text *beats* against it (30.6px rules under a 37.8px line box is what made
  the synopsis unreadable). So the bio and the synopsis use `.paper-grid--margin` (margin rule
  only) and each `<p>` draws its own ruling pitched in **`lh`** — the element's own computed line
  box, which matches by construction. Don't "simplify" that to `calc(font-size × line-height)`:
  the browser rounds the used font-size, which drifts 0.015px per line. Paragraph gaps are `1lh`,
  so the rhythm carries across paragraphs. Don't reintroduce section ruling there.
- Serif narrates (Fraunces), grotesk punches (Space Grotesk / Stack Sans Headline), mono
  micro-labels (JetBrains Mono `.mono`). One cobalt accent `#2742f0`; warm counterpoint is
  sunflower amber `#e8a31a`, not red. "Printer's proof-sheet" decor (crop marks, registration
  marks, ruler ticks, hanko) is the house flavor — very on-theme here.
- Motion: Lenis + GSAP wired in `src/layouts/Base.astro`. Scroll entrances must be reversible
  (`toggleActions: 'play none none reverse'` or scrub — never `once: true`). Ease:
  `cubic-bezier(0.22, 1, 0.36, 1)`. Reader page flips are transform-only (`translate3d`).
- Always honor `prefers-reduced-motion` and coarse pointers (no custom cursor, native
  scrolling fallbacks).

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

## The six acts

`/asu` runs the full cinematic structure from the art site: hero → **act-film** → bio →
**act-scatter** → gallery → **act-character** → craft → **act-select** → **act-3d** →
**act-grid** → contact.

- **Most of the CSS was already here.** `global.css` shipped the Editorial FUI system —
  `.act__*`, `.pillarbox`, `.sidecol`, `.fui`, `.selbox`, `.wiregrid`, `.draw-svg` — unused. Reuse
  it; do not add parallel styles.
- **But the per-act inner layout was NOT** — `.act-film__*`, `.act-scatter__*`, `.act-char__*`,
  `.act-select__*`, `.act-3d__*`, `.act-grid__*` and `.frag*` were left behind when the markup came
  across, so every act's text block was unstyled and the character subject and collage fragments
  rendered as raw images. Ported verbatim from `art/src/pages/index.astro` (~lines 778-828). If
  anything else from the art site looks wrong here, check that repo before writing new rules.
- Modules in `src/scripts/`: `cinema`, `channel`, `scatter`, `grid3d`, `perspective`, `select`,
  `ambient`, `draw`, `displacement`, `kinetic`. Each owns its own reduced-motion / coarse-pointer
  fallback, so the page calls them unconditionally.
- **`text.ts` and `kinetic.ts` both export `assemble`, and they are different.** `text.ts`'s is the
  hero-name version already in use; kinetic's is per-character. `/asu` imports the latter as
  `kineticAssemble`.
- `displacement.ts` needs WebGL (`ogl`) — gated on a live context and a fine pointer. `draw.ts`
  needs `DrawSVGPlugin`, which ships in the public `gsap` package since 3.13.
- Act backdrops are scenery photos in `src/assets/scenery/`, encoded through `getImage()` at
  quality 60 — they sit behind a scrim and must never be full-quality.
- Every act's imagery is the author's **own artwork** where they want it, not fixed files — the
  scene slots above decide, per act, between the photograph, a pinned plate and a full backdrop.
  With an empty gallery each slot degrades to its photograph and the acts still stand up.

## The artist signature stamp

The vermillion box holding a single kanji is **retired**. The artist's own animated chibi doodle
(`stamp` / `stampStatic` in `src/data/showcase.ts`) now signs the shelf hero, the artist teaser, the
library author card, the `/asu` hero and every book's synopsis. Animated WebP cannot be paused with
CSS, so each placement uses `<picture>` with the still frame under `prefers-reduced-motion`.

## The bird-flock transition

`src/scripts/flock.ts` — a canvas boids flock drags an ink curtain across the viewport; the sweep
spans the navigation, covering the old page and uncovering the new one.

- Any `<a data-flock>` opts in (`data-flock="back"` reverses the sweep direction). Wiring is
  delegated from `Base.astro`, so links inside Svelte islands work.
- The handshake is `sessionStorage['pr:flock']`, because a real navigation tears down all JS. **The
  inline script in `Base.astro`'s `<head>` is load-bearing** — it paints `html.flock-cover` before
  first paint, otherwise the destination flashes its hero before the module mounts. It also carries
  a 2.5 s failsafe that clears the cover if the module never runs.
- Flocking is O(n): birds deposit velocity into a coarse grid, then steer toward their own cell's
  average. Neighbour queries would be O(n²). All birds are stroked as one path per frame.
- Bird count scales with viewport area (600–2400) and DPR is capped at 2.
- `prefers-reduced-motion` gets a plain 240 ms ink fade with no birds.

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
- Forced spreads share a `spread_pair_id` uuid on exactly two page rows; the reader's
  `resolveSheets()` joins them in every layout mode.
- Storage paths are immutable (`works/{work_id}/{page_id}/…`, `cacheControl` 1 year) —
  reordering pages never touches storage.
- **The shelf's book grid is still `client:only`**, so the cards are not server-rendered. That is a
  known deferral, not an oversight: `Library.svelte` registers ScrollTrigger at module scope and
  would need auditing before it could SSR. The hero, showcase strip and artist teaser around it are
  static HTML, so the page is no longer content-empty on first paint.
