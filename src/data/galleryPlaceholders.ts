/**
 * DEV SCAFFOLDING — never shipped.
 *
 * The `artworks` table starts empty, and with an empty gallery most of /asu
 * collapses: no hero plate, no featured row, no strip, no filter chips, no
 * lightbox, no subject for the character act and no fragments for the selection
 * act. That is correct behaviour for a real visitor and useless for looking at
 * the page while building it.
 *
 * So `npm run dev` substitutes stand-in artwork built from the illustrations
 * this repo already ships in src/assets/showcase — the same pieces the homepage
 * hero and strip use, which are also the ones headed for the real gallery. The
 * variants are produced at the same three sizes the browser uploader makes
 * (full 1600 / med 900 / thumb 320 WebP, see lib/artImage.ts), so every consumer
 * downstream sees an ordinary ArtworkRec and needs no special case.
 *
 * asu.astro reaches for this ONLY when `import.meta.env.DEV` and the real
 * gallery came back empty — real rows always win. Delete this file once the
 * gallery is seeded for good (scripts/seed-artist.mjs).
 */
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
import type { ArtworkRec } from '../lib/types';

import heroArt from '../assets/showcase/hero-art.webp';
import blossomLean from '../assets/showcase/blossom-lean.webp';
import postPair from '../assets/showcase/post-pair.webp';
import postSolo from '../assets/showcase/post-solo.webp';
import studyDesk from '../assets/showcase/study-desk.webp';
import newyear2569 from '../assets/showcase/newyear-2569.webp';
import comicMono from '../assets/showcase/comic-mono.webp';
import greenOutfit from '../assets/showcase/green-outfit.webp';
import tomatoChibi from '../assets/showcase/tomato-chibi.webp';
import uniformStand from '../assets/showcase/uniform-stand.webp';

// Same variant sizes as lib/artImage.ts, so the placeholders load like the real
// thing rather than lying about how heavy the page will be.
const LONG_EDGE = 1600;
const MED_EDGE = 900;
const THUMB_EDGE = 320;

interface Piece {
  image: ImageMetadata;
  title: string;
  /** Drives the filter chips — more than one value, or they never render. */
  medium: string;
  alt: string;
  featured?: boolean;
}

/**
 * The ten static pieces in src/assets/showcase. The animated ones (stamp,
 * hug-doodle, sketch-loop) are skipped: sharp flattens them to frame one and
 * they are far too small for a gallery frame anyway.
 *
 * Alt text for the six pieces the homepage strip already carries is copied
 * verbatim from data/showcase.ts rather than re-written. Mediums use the
 * vocabulary scripts/seed-artist.mjs established for the real rows.
 *
 * The featured piece leads the gallery, the hero plate AND the character act's
 * double exposure, so it wants to be a portrait-orientation figure — .asu__frame
 * is 4/5 and crops. Move `featured` to another row to change all three at once.
 */
const PIECES: Piece[] = [
  {
    image: blossomLean,
    title: 'Blossom, leaning',
    medium: 'Illustration',
    alt: 'A student leaning forward outdoors, cherry blossom drifting past.',
    featured: true,
  },
  {
    image: postPair,
    title: 'Two under one sky',
    medium: 'Key art',
    alt: 'Two characters close together against a blue sky, one holding a book.',
  },
  {
    image: studyDesk,
    title: 'Asleep at the desk',
    medium: 'Illustration',
    alt: 'A dim cinematic still of a student asleep at a desk covered in sticky notes.',
  },
  {
    image: newyear2569,
    title: 'New year, 2569',
    medium: 'Illustration',
    alt: 'A colourful new-year illustration of a student in a floral shirt above stylised waves.',
  },
  {
    image: comicMono,
    title: 'Four panels',
    medium: 'Manga',
    alt: 'A monochrome comic page: two students framed across several panels.',
  },
  {
    image: postSolo,
    title: 'Dappled light',
    medium: 'Illustration',
    alt: 'A single character in soft dappled light.',
  },
  {
    image: heroArt,
    title: 'Beyond the door',
    medium: 'Key art',
    alt: 'Wide key art of the series cast.',
  },
  {
    image: uniformStand,
    title: 'Uniform, standing',
    medium: 'Character design',
    alt: 'Full-body character standing in school uniform.',
  },
  {
    image: greenOutfit,
    title: 'Green outfit',
    medium: 'Character design',
    alt: 'Full-body character in a green casual outfit.',
  },
  {
    image: tomatoChibi,
    title: 'Tomato hats',
    medium: 'Chibi',
    alt: 'Two chibi characters wearing tomato hats.',
  },
];

/** Long edge to 1600, aspect preserved — the same rule `downscale` applies. */
function fullWidth(img: ImageMetadata): number {
  return img.width >= img.height
    ? Math.min(img.width, LONG_EDGE)
    : Math.round(Math.min(img.height, LONG_EDGE) * (img.width / img.height));
}

async function variants(img: ImageMetadata) {
  const width = fullWidth(img);
  const [full, med, thumb] = await Promise.all([
    getImage({ src: img, format: 'webp', width }),
    getImage({ src: img, format: 'webp', width: Math.min(width, MED_EDGE), quality: 82 }),
    getImage({ src: img, format: 'webp', width: Math.min(width, THUMB_EDGE), quality: 80 }),
  ]);
  return {
    fullUrl: full.src,
    medUrl: med.src,
    thumbUrl: thumb.src,
    width,
    height: Math.round(width * (img.height / img.width)),
  };
}

/** Stand-in gallery, shaped exactly like rows out of the `artworks` table. */
export async function placeholderWorks(): Promise<ArtworkRec[]> {
  return Promise.all(
    PIECES.map(async (p, i) => ({
      id: `placeholder-${String(i + 1).padStart(2, '0')}`,
      title: p.title,
      medium: p.medium,
      alt: p.alt,
      sortKey: `a${i}`,
      featured: p.featured ?? false,
      published: true,
      ...(await variants(p.image)),
    })),
  );
}

/**
 * The profile row exists but carries no portrait and no links, so the bio
 * figure, the contact links and the commission CTA are all missing too. These
 * fill them in under the same dev-only gate.
 *
 * The address is deliberately an example.com one — a real personal address must
 * never appear in this repo (see CLAUDE.md, identity separation).
 */
export const PLACEHOLDER_LINKS = {
  x: 'https://x.com/asu_azure',
  x_handle: '@asu_azure',
  email: 'asu@example.com',
};

export const PLACEHOLDER_COMMISSIONS_OPEN = true;

/** Portrait plate for the bio section, at the uploader's 1200 long edge. */
export async function placeholderPortrait(): Promise<string> {
  const width = Math.round(1200 * (postSolo.width / postSolo.height));
  return (await getImage({ src: postSolo, format: 'webp', width })).src;
}
