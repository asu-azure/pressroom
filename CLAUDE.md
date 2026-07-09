# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Pressroom** — a doujinshi (self-made manga) library + reader for illustrator **Asu Azure**.
The author uploads works as PDF (import-only: pages are rasterized to WebP in the browser at
upload time), arranges pages (drag-drop order, RTL/LTR, forced two-page spreads), and attaches
margin notes readers can see. Readers browse a public library and read with their choice of
single/double layout and scroll/flip mode. Public read, author-only write.

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
(reader, uploader, arranger, dashboard) + supabase-js **in the browser only** (no custom
backend, no server-side data fetching) + GSAP + Lenis for motion. `pdfjs-dist` rasterizes
uploaded PDFs client-side (worker via `?url` import, client-only — never import pdfjs in
Astro frontmatter).

## Commands

- `npm run dev` — dev server (localhost:4321)
- `npm run build` — production build
- `npm run test` — vitest (layout resolver etc.)

## Supabase setup (one-time)

1. Run `supabase/schema.sql` then `supabase/storage.sql` in the SQL editor — replace
   `AUTHOR_UID` with the author user's `auth.users.id` first.
2. Create the author user (email+password) in Auth, then **disable public signups**.
3. Put the project URL + anon key in `.env`.

## Design system (inherited "Editorial FUI")

- Tokens & utilities live in `src/styles/global.css` (CSS custom properties — reuse, don't
  hardcode). Signature spreads `.spread--ink` / `.spread--paper` flip the semantic tokens.
- Serif narrates (Fraunces), grotesk punches (Space Grotesk / Stack Sans Headline), mono
  micro-labels (JetBrains Mono `.mono`). One cobalt accent `#2742f0`; warm counterpoint is
  sunflower amber `#e8a31a`, not red. "Printer's proof-sheet" decor (crop marks, registration
  marks, ruler ticks, hanko) is the house flavor — very on-theme here.
- Motion: Lenis + GSAP wired in `src/layouts/Base.astro`. Scroll entrances must be reversible
  (`toggleActions: 'play none none reverse'` or scrub — never `once: true`). Ease:
  `cubic-bezier(0.22, 1, 0.36, 1)`. Reader page flips are transform-only (`translate3d`).
- Always honor `prefers-reduced-motion` and coarse pointers (no custom cursor, native
  scrolling fallbacks).

## Gotchas

- **Safari cannot encode WebP** via `canvas.toBlob` — the uploader probes once and falls back
  to JPEG. Prefer uploading PDFs from Chrome/Edge desktop.
- Page order uses **fractional index keys** (`fractional-indexing`): a reorder is one row
  UPDATE — never renumber all pages.
- Forced spreads share a `spread_pair_id` uuid on exactly two page rows; the reader's
  `resolveSheets()` joins them in every layout mode.
- Storage paths are immutable (`works/{work_id}/{page_id}/…`, `cacheControl` 1 year) —
  reordering pages never touches storage.
