/**
 * GET /og/art/<key>.jpg — the share card for one artwork (1200×630 JPEG): the
 * piece as a print taped to the studio wall, tilted as it hangs on /asu.
 * `/asu?art=<key>` names this as its og:image; layout and SVG are in
 * lib/shareCard.ts.
 *
 * A server read for <head> metadata like the others (see CLAUDE.md): public
 * rows with the anon key, nothing user-specific. Never a 500: an unknown key is
 * a 404, and if anything fails after the piece is found, the card falls back to
 * a redirect to its own 900 px picture so a shared link still shows the art.
 */
import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { supabaseServer } from '../../../lib/supabaseServer';
import { toArtworkRec } from '../../../lib/storagePaths';
import { findArt, galleryOrder } from '../../../lib/artLink';
import { hangGallery } from '../../../lib/wallLayout';
import { CARD_H, CARD_W, cardSvg, plasterGrain, printBox } from '../../../lib/shareCard';
import type { ArtworkRec, ArtworkRow } from '../../../lib/types';

export const prerender = false;

// The image under a key never changes (storage paths are immutable; the page
// adds ?v=<hash of the picture's URL>), so the edge may keep it for a year.
const CACHE = 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400';

let grain: Promise<{ fine: Buffer; mottle: Buffer }> | null = null;
function plaster() {
  grain ??= (async () => {
    const g = plasterGrain();
    const raw = { raw: { width: g.width, height: g.height, channels: g.channels } } as const;
    const at = (size: number) => sharp(Buffer.from(g.data), raw).resize(size, size, { kernel: 'linear' }).png().toBuffer();
    // as on the wall: the tile at 128 px for grain, blown up for mottling (560, not
    // the wall's 700: sharp won't tile anything taller than the 630 px card)
    const [fine, mottle] = await Promise.all([at(128), at(560)]);
    return { fine, mottle };
  })();
  return grain;
}

export const GET: APIRoute = async ({ params }) => {
  let works: ArtworkRec[] = [];
  try {
    const { data, error } = await supabaseServer
      .from('artworks')
      .select('*')
      .eq('published', true)
      .order('sort_key', { ascending: true });
    if (error) throw error;
    works = (data as ArtworkRow[]).map(toArtworkRec);
  } catch {
    return new Response('unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  const order = galleryOrder(works);
  const piece = findArt(order, params.key);
  if (!piece) return new Response('not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });

  try {
    const res = await fetch(piece.medUrl);
    if (!res.ok) throw new Error(`picture ${res.status}`);
    const src = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(src).metadata();
    const box = printBox(piece.width && piece.height ? piece.width / piece.height : (meta.width ?? 1) / (meta.height ?? 1), meta.width, meta.height);
    // librsvg reads JPEG/PNG data URIs, not WebP: hand it a JPEG of the exact size
    const art = await sharp(src).resize(box.imgW, box.imgH, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer();
    const p = hangGallery(order).prints[order.indexOf(piece)];
    const svg = cardSvg({ box, r: p.r, hold: p.hold, tr: p.tr, art: `data:image/jpeg;base64,${art.toString('base64')}` });
    const { fine, mottle } = await plaster();
    const jpeg = await sharp({ create: { width: CARD_W, height: CARD_H, channels: 3, background: '#1a191e' } })
      .composite([
        { input: mottle, tile: true },
        { input: fine, tile: true },
        { input: Buffer.from(svg) },
      ])
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
    return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': CACHE } });
  } catch (err) {
    console.error(`[og/art] ${params.key}: card failed, redirecting to the picture`, err);
    // still show the art, just not on the wall
    return new Response(null, { status: 302, headers: { Location: piece.medUrl, 'Cache-Control': 'public, max-age=300' } });
  }
};
