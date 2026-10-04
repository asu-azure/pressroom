/**
 * Server-side data for the music pages: each song's imported timeline, its art, and its acrylic
 * keychain (lib/keychain.ts draws it). Astro frontmatter only: `qrcode` and `astro:assets` never
 * reach the client.
 *
 * The QR on a keychain's back is real — it encodes the song page's URL with ?scan=1, so the design
 * can go straight to a printed keychain and a phone camera opens the playlist, arriving as if
 * scanned. /ost?scan=1 (printed before the move) redirects to the same place.
 */
import QRCode from 'qrcode';
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
import { songPath, type Song } from '../data/songs';
import type { KeychainData } from './keychain';

/** The imported timeline of a song (scripts/import-ost.mjs). */
export interface SongData {
  id: string;
  duration: number;
  offset: number;
  movements: { bar: number; name: string; sub?: string; t: number }[];
  lyrics: { section: string; ja: string; th: string; t0: number; t1: number; chunks: [string, string, number, number][] }[];
  hits: [number, number][];
  motifRh?: [number, number][];
  wave: number[];
}

const DATA = import.meta.glob<SongData>('../data/ost/*.json', { eager: true, import: 'default' });
const ART = import.meta.glob<ImageMetadata>('../assets/ost/*.jpg', { eager: true, import: 'default' });

const pick = <T>(map: Record<string, T>, dir: string, stem: string, ext: string): T => {
  const hit = map[`${dir}/${stem}.${ext}`];
  if (!hit) throw new Error(`music: no ${dir}/${stem}.${ext}`);
  return hit;
};

export const songData = (song: Song): SongData => pick(DATA, '../data/ost', song.data!, 'json');
export const songArt = (song: Song, which: 'night' | 'day' = 'night'): ImageMetadata =>
  pick(ART, '../assets/ost', song.art![which], 'jpg');

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const songLength = (song: Song) => fmtTime(songData(song).duration);

export async function songKeychain(song: Song, site: URL | undefined, artWidth = 640): Promise<KeychainData> {
  const [img, qr] = await Promise.all([
    getImage({ src: songArt(song), width: artWidth, format: 'webp', quality: 80 }),
    // A PNG, not inline SVG: an SVG is painted on the main thread, and on the
    // keychain it was part of a ~0.5 s hitch. Small (one pixel per module ×4)
    // and scaled with image-rendering: pixelated, so it stays sharp and scannable.
    QRCode.toDataURL(new URL(`${songPath(song.slug)}?scan=1`, site ?? 'https://pressroom-omega.vercel.app').href, {
      margin: 0,
      scale: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#16140f', light: '#ffffff' },
    }),
  ]);
  return {
    art: img.src,
    wave: songData(song).wave,
    qr: `<img src="${qr}" alt="" width="132" height="132" decoding="async">`,
    title: song.title!,
  };
}
