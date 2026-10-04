/**
 * The music section's catalogue: one entry per keychain on the /music rack, in rack order.
 *
 * Plain data, no asset imports, so any page or test can read it. Everything timed — the length,
 * the movements, the lyrics, the accent hits, the keychain's wave — comes from the song's
 * imported JSON (`src/data/ost/<data>.json`, written by scripts/import-ost.mjs), never from here.
 * Words around a song are author copy under the song's `copy` prefix in copyKeys.ts.
 *
 * Titles are the owner's: ナガレボシ / STARFALL, never the Thai title. Songs not out yet hang as
 * clear, blank charms with no title at all (Jun, 4 Oct) — a slug and nothing else.
 */

/** Sky per movement: [top, bottom, light] — `light` picks the star field (day = faint). */
export type Mood = [top: string, bottom: string, light: 'day' | 'night'];

export interface Song {
  slug: string;
  status: 'out' | 'coming';
  title?: { ja: string; en: string };
  /** stem of src/data/ost/<data>.json */
  data?: string;
  /** public path of the MP3 */
  audio?: string;
  /** stems in src/assets/ost/: the square cover (keychain print, playlist, share card, lock screen)
   *  and the 16:9 picture the video shows before anyone presses play */
  art?: { cover: string; poster: string };
  /** copy-key prefix for the song's own words (`ost` for STARFALL: its keys predate the catalogue) */
  copy?: string;
  /** the music video: YouTube id, and where the song's t = 0 falls in the video (s) */
  mv?: { youtube: string; offset: number };
  /** one per movement, same order as the JSON's movements */
  moods?: Mood[];
  /** the movement whose strong accents launch falling stars */
  highlight?: number;
  /** the album name the lock screen shows (Media Session) */
  album?: string;
}

export const SONGS: Song[] = [
  {
    slug: 'starfall',
    status: 'out',
    title: { ja: 'ナガレボシ', en: 'STARFALL' },
    data: 'starfall',
    audio: '/ost/starfall.mp3',
    // cover F2 of music-repo/_work/cover_options (Jun, 4 Oct); the poster is the MV's own title frame
    art: { cover: 'starfall-cover', poster: 'starfall-screen' },
    copy: 'ost',
    // The MV as published (premiere 10 Oct 2026 21:00 JST). It starts on the song's own t = 0
    // (the final render's audio is v07i from its first sample), so the room needs no offset.
    mv: { youtube: 'XpEp6WpBBC8', offset: 0 },
    // Follows the MV's looks, darker for type.
    moods: [
      ['#241d16', '#0c0c0d', 'day'], // I     Prologue — memory
      ['#173466', '#0b1224', 'day'], // II    Blue Margin
      ['#29406a', '#101626', 'day'], // III   Long Shadows
      ['#4a3317', '#120d08', 'day'], // IV    Hallway Echo — golden hour
      ['#4a2233', '#130a10', 'day'], // V     Second Hand — dusk
      ['#0e1846', '#04060f', 'night'], // VI    Sodium Light
      ['#18203a', '#07080d', 'night'], // VII   Rain on Glass
      ['#232048', '#09081a', 'night'], // VIII  Roll Call
      ['#4a3510', '#100b04', 'day'], // IX    Semper ad Lucem
      ['#0f2a4a', '#050b16', 'night'], // X     Continue?
      ['#12233a', '#060a12', 'night'], // XI    Cold Hands
      ['#3a1016', '#0b0406', 'night'], // XII   Undertow
      ['#1a1a1c', '#050505', 'night'], // XIII  One Breath
      ['#0b1238', '#02030a', 'night'], // XIV   Starfall
      ['#5a3a3a', '#1c1420', 'day'], // XV    Sunrise
      ['#1c2030', '#0c0c0d', 'night'], // XVI   Epilogue
    ],
    highlight: 13, // XIV. Starfall
    album: '扉の向こうはヒマワリ畑 OST',
  },
  { slug: 'coming-1', status: 'coming' },
  { slug: 'coming-2', status: 'coming' },
  { slug: 'coming-3', status: 'coming' },
];

export const songBySlug = (slug: string | undefined): Song | undefined => SONGS.find((s) => s.slug === slug);

/** Songs with a page of their own. */
export const releasedSongs = (): Song[] => SONGS.filter((s) => s.status === 'out');

/** The song page's path; the QR on a printed keychain encodes it with `?scan=1`. */
export const songPath = (slug: string) => `/music/${slug}`;
