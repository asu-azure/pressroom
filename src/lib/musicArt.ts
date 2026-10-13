/**
 * The music section's pictures, server side (Astro frontmatter only — `astro:assets` never reaches
 * the client). All of them are drawn by music/_work/yt_cover/jackets.py in the music repo, in the
 * YouTube stills' design, and committed to src/assets/music/:
 *
 *   <slug>-jacket.jpg   the CD's front (1600²): the crate's case, the list, the share card
 *   <slug>-disc.jpg     the disc's print (1200²); the crate draws the clear hub over its middle
 *   spines.jpg          one column per CD (64 × 1300 each, in crate order), one texture for all
 *   inner.jpg           the inside of the booklet, seen when a case lies open
 *   posters/<id>.jpg    each video's YouTube still (1280 × 720), shown until the player loads
 *   crate-still.jpg     the crate itself, for the homepage and the share card (?still=1, see index.ts)
 */
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
import { RELEASES, type Release } from '../data/music';

const ART = import.meta.glob<ImageMetadata>('../assets/music/**/*.jpg', { eager: true, import: 'default' });

const pick = (path: string): ImageMetadata => {
  const hit = ART[`../assets/music/${path}`];
  if (!hit) throw new Error(`music: no src/assets/music/${path}`);
  return hit;
};
const has = (path: string) => Boolean(ART[`../assets/music/${path}`]);

export const jacketArt = (slug: string) => pick(`${slug}-jacket.jpg`);
export const discArt = (slug: string) => pick(`${slug}-disc.jpg`);
export const posterArt = (youtube: string) => pick(`posters/${youtube}.jpg`);
export const spineAtlas = () => pick('spines.jpg');
export const innerArt = () => pick('inner.jpg');
export const crateStill = () => (has('crate-still.jpg') ? pick('crate-still.jpg') : null);

/** Columns in spines.jpg: a CD's spine is the column at its place in the catalogue. */
export const SPINE_COLUMNS = 4;
export const spineColumn = (r: Release) => RELEASES.indexOf(r);

const webp = (src: ImageMetadata, width: number, quality = 80) => getImage({ src, width, format: 'webp', quality }).then((i) => i.src);

/** Every picture the crate and its liners need, as served URLs. */
export async function crateArt() {
  const cds = await Promise.all(
    RELEASES.map(async (r) => {
      const [jacketS, jacketL, disc, posters] = await Promise.all([
        webp(jacketArt(r.slug), 512, 78),
        webp(jacketArt(r.slug), 1024, 82),
        webp(discArt(r.slug), 1024, 80),
        Promise.all(r.tracks.map((t) => webp(posterArt(t.youtube), 960, 76))),
      ]);
      return { slug: r.slug, jacketS, jacketL, disc, posters };
    }),
  );
  const [spines, inner] = await Promise.all([
    getImage({ src: spineAtlas(), format: 'webp', quality: 86 }).then((i) => i.src),
    webp(innerArt(), 1024, 76),
  ]);
  return { cds, spines, inner };
}
