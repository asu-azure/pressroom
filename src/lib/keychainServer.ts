/**
 * Server-side data for the soundtrack keychain (lib/keychain.ts draws it).
 * Astro frontmatter only: `qrcode` and `astro:assets` never reach the client.
 *
 * The QR on the back is real — it encodes this site's playlist URL, so the
 * design can go straight to a printed keychain and a phone camera will open
 * /ost?scan=1 (the playlist, arriving as if scanned).
 */
import QRCode from 'qrcode';
import { getImage } from 'astro:assets';
import art from '../assets/ost/starfall-night.jpg';
import song from '../data/ost/starfall.json';
import type { KeychainData } from './keychain';

export const PLAYLIST_PATH = '/ost?scan=1';

export async function soundtrackKeychain(site: URL | undefined, artWidth = 640): Promise<KeychainData> {
  const [img, qr] = await Promise.all([
    getImage({ src: art, width: artWidth, format: 'webp', quality: 80 }),
    // A PNG, not inline SVG: an SVG is painted on the main thread, and on the
    // keychain it was part of a ~0.5 s hitch. Small (one pixel per module ×4)
    // and scaled with image-rendering: pixelated, so it stays sharp and scannable.
    QRCode.toDataURL(new URL(PLAYLIST_PATH, site ?? 'https://pressroom-omega.vercel.app').href, {
      margin: 0,
      scale: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#16140f', light: '#ffffff' },
    }),
  ]);
  return { art: img.src, wave: song.wave, qr: `<img src="${qr}" alt="" width="132" height="132" decoding="async">`, title: song.title };
}

export function songLength(): string {
  const d = song.duration;
  return `${Math.floor(d / 60)}:${String(Math.floor(d % 60)).padStart(2, '0')}`;
}
