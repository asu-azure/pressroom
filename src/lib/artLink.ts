/**
 * A link to one artwork: `/asu?art=<key>`.
 *
 * The key is the first 8 hex digits of the artwork's uuid — short enough to
 * paste into a post, stable across reorders (unlike the Nº printed on the
 * print, which follows gallery order), and unique in practice for a personal
 * gallery. `findArt` matches by prefix, so a longer key also works if two ever
 * collide. Shared by the page (SSR meta + opening the lightbox), the share-card
 * endpoint (pages/og/art/[key].jpg.ts) and the Studio's COPY LINK.
 */

export const KEY_LEN = 8;
const KEY_RE = /^[0-9a-f]{8,32}$/;

export function artKey(id: string): string {
  return id.replace(/-/g, '').slice(0, KEY_LEN).toLowerCase();
}

/** The piece a key points at, or null for junk, unknown or empty keys. */
export function findArt<T extends { id: string }>(works: readonly T[], key: string | null | undefined): T | null {
  const k = (key ?? '').trim().toLowerCase();
  if (!KEY_RE.test(k)) return null;
  return works.find((w) => w.id.replace(/-/g, '').toLowerCase().startsWith(k)) ?? null;
}

export function artPath(key: string): string {
  return `/asu?art=${encodeURIComponent(key)}`;
}

/** A short, stable hash of a string (FNV-1a, base36) — the share card's cache-buster. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** The order a visitor sees: the featured piece (else the first) leads, the rest in sort order. */
export function galleryOrder<T extends { id: string; featured: boolean }>(works: readonly T[]): T[] {
  const lead = works.find((w) => w.featured) ?? works[0];
  return lead ? [lead, ...works.filter((w) => w !== lead)] : [];
}
