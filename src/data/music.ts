/**
 * The music section's catalogue: one entry per CD in the /music crate, front of the crate first.
 *
 * Every song is on YouTube (Jun, 14 Oct 2026) and plays from there; a CD is a song and its
 * versions, like a Japanese single (the song, its 90秒サイズ, its instrumental). Plain data, no asset
 * imports, so any page or test can read it: jackets and posters are found by slug and video id in
 * src/assets/music/ (lib/musicArt.ts). The words around a CD — its liner note and credits — are
 * author copy under `music.<slug>.*` in copyKeys.ts.
 *
 * Titles are the owner's, as printed: ナガレボシ / STARFALL (never the Thai title), オイカゼ /
 * TAILWIND, ヒカリノホウヘ / LIGHTWARD. Version labels are YouTube's.
 */

export interface Track {
  /** the YouTube video id */
  youtube: string;
  /** what sets this track apart from the CD's first (null for the song itself) */
  version: { ja: string; en: string } | null;
  /** the length YouTube shows, in whole seconds: the IFrame API's getDuration() before playing
   *  (checked 14 Oct 2026). Not the file's: YouTube's transcode runs up to a second longer. */
  seconds: number;
  /** has a sung vocal (the Japanese proofreading credit goes with it) */
  sung: boolean;
}

export interface Release {
  /** also the old song page's slug: /music/starfall (and the printed QR) lands on this CD */
  slug: string;
  title: { ja: string; en: string };
  tracks: Track[];
}

export const RELEASES: Release[] = [
  {
    slug: 'starfall',
    title: { ja: 'ナガレボシ', en: 'STARFALL' },
    tracks: [{ youtube: '1hcifnX2UyQ', version: null, seconds: 311, sung: true }],
  },
  {
    slug: 'tailwind',
    title: { ja: 'オイカゼ', en: 'TAILWIND' },
    tracks: [
      { youtube: '4E-jdub8-Co', version: null, seconds: 341, sung: true },
      { youtube: 'rEDtqFOgd70', version: { ja: '90秒サイズ', en: '90 second size' }, seconds: 92, sung: true },
      { youtube: 'Z8VHIUHYqrs', version: { ja: 'Instrumental', en: 'Instrumental' }, seconds: 341, sung: false },
    ],
  },
  {
    slug: 'lightward',
    title: { ja: 'ヒカリノホウヘ', en: 'LIGHTWARD' },
    tracks: [{ youtube: 'MqBK9mzmfhQ', version: null, seconds: 358, sung: false }],
  },
];

/** How many cases the crate holds: the CDs, then empty clear cases (enough for the wave to read). */
export const SLOTS = 10;

export const releaseBySlug = (slug: string | null | undefined): Release | undefined => RELEASES.find((r) => r.slug === slug);

/** Where a CD lives: the crate, opened on that case. */
export const cdPath = (slug: string) => `/music?cd=${encodeURIComponent(slug)}`;

/** The video on YouTube, optionally from a moment (whole seconds). */
export const watchUrl = (id: string, t = 0) =>
  `https://www.youtube.com/watch?v=${id}${t >= 1 ? `&t=${Math.floor(t)}s` : ''}`;

/** m:ss */
export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The CD's running time: its tracks as YouTube shows them, added up. */
export const releaseSeconds = (r: Release) => r.tracks.reduce((n, t) => n + t.seconds, 0);

/** A track's version label in a language (the title itself stays as printed): 90秒サイズ / 90 second size. */
export const versionLabel = (t: Track, lang: string) => (t.version ? (lang === 'ja' ? t.version.ja : t.version.en) : '');
