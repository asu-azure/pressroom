import type { AstroGlobal } from 'astro';

/**
 * CDN cache for a server-rendered public shell.
 *
 * These pages are SSR only so author edits (site copy, the artist profile, a
 * work's title for link previews) show without a redeploy — not because they
 * differ per visitor. So Vercel's edge may keep a copy for `seconds` and serve
 * a stale one while it refetches in the background; the browser itself always
 * revalidates. An author's save therefore reaches visitors within ~`seconds`.
 *
 * ⚠ Only for public pages that read nothing user-specific and set no cookies.
 * Never call this from /studio/*.
 */
export function cacheShell(Astro: AstroGlobal, seconds = 60) {
  Astro.response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  Astro.response.headers.set(
    'Vercel-CDN-Cache-Control',
    `s-maxage=${seconds}, stale-while-revalidate=86400`,
  );
}
