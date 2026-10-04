/**
 * The overview's cast stage (CastStage.svelte) and the cast file read the
 * characters through these — pure, so the rules are tested (castView.test.ts).
 */
import type { CastImage, Character } from './types';

/** 「タイム/Time」 is how the Studio stores a name: the Japanese, then the Latin
    after a slash (either width). A name without one is all Japanese. */
export function splitName(name: string): { ja: string; en: string } {
  const at = name.search(/[/／]/);
  if (at < 0) return { ja: name.trim(), en: '' };
  const ja = name.slice(0, at).trim();
  const en = name.slice(at + 1).trim();
  // 「/Time」 or 「タイム/」: whatever is there is the name
  return ja ? { ja, en } : { ja: en, en: '' };
}

/** Main characters get a scene, the rest a print in the row below. The author
    marks them (`main`); a cast nobody marked leads with its first two, which is
    how every book was ordered before the flag existed. */
export function castParts(cast: Character[]): { main: Character[]; crew: Character[] } {
  const marked = cast.some((c) => c.main);
  const isMain = (c: Character, i: number) => (marked ? Boolean(c.main) : i < 2);
  return {
    main: cast.filter(isMain),
    crew: cast.filter((c, i) => !isMain(c, i)),
  };
}

/** The card's picture. Older profiles have no portrait: their first gallery
    image stands in, else the face icon — all black-and-white manga art, so
    they are tinted unless the author said otherwise. */
export function portraitOf(c: Character): { url: string; mono: boolean } | null {
  if (c.portraitUrl) return { url: c.portraitUrl, mono: c.portraitMono ?? false };
  const url = c.images?.[0]?.url ?? c.iconUrl;
  return url ? { url, mono: c.portraitMono ?? true } : null;
}

/** The file's gallery: the portrait first, then the gallery without it;
    with neither, the icon. */
export function galleryOf(c: Character): CastImage[] {
  const images = c.images ?? [];
  const list = c.portraitUrl
    ? [{ url: c.portraitUrl }, ...images.filter((im) => im.url !== c.portraitUrl)]
    : images;
  return list.length ? list : c.iconUrl ? [{ url: c.iconUrl }] : [];
}

/** A small tilt per print, the same every visit (from the id, not the order —
    reordering the cast doesn't reshuffle the wall). Alternates sides. */
export function tiltOf(id: string, i: number): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const mag = 0.8 + (h % 1000) / 1000 * 1.6; // 0.8–2.4°
  return Math.round((i % 2 ? mag : -mag) * 10) / 10;
}
