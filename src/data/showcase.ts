/**
 * Homepage artwork.
 *
 * `slides` feeds the skewed panel strip. Panels CROP rather than fit, which is
 * what lets the strip stay thin — these pieces run from 0.66 to 1.52 aspect, so
 * nothing sized to show them whole could be short.
 *
 * Because panels are wide bands, the vertical focal point is the difference
 * between a face and a torso. `focus` is a CSS object-position, tuned per piece
 * against a real crop preview — see the comment on each.
 *
 * Deliberately not here: the three pieces on plain white backgrounds
 * (tomato-chibi, uniform-stand, green-outfit) read as near-blank slots between
 * full-bleed neighbours, and the two animated sketches are too small to crop.
 * Their files are still in src/assets/showcase if they should come back.
 */
import type { ImageMetadata } from 'astro';

import studyDesk from '../assets/showcase/study-desk.webp';
import newyear2569 from '../assets/showcase/newyear-2569.webp';
import blossomLean from '../assets/showcase/blossom-lean.webp';
import postPair from '../assets/showcase/post-pair.webp';
import postSolo from '../assets/showcase/post-solo.webp';
import comicMono from '../assets/showcase/comic-mono.webp';

/** Faint art behind the PRESSROOM hero. */
export { default as heroArt } from '../assets/showcase/hero-art.webp';
/** Hanko stamp — the doodle, keyed transparent and tinted vermillion. */
export { default as stamp } from '../assets/showcase/stamp.webp';
/** Single frame of the same, for prefers-reduced-motion. */
export { default as stampStatic } from '../assets/showcase/stamp-static.png';

export interface Slide {
  image: ImageMetadata;
  /** Described for screen readers. Panels carry no visible caption. */
  alt: string;
  /** CSS object-position for the crop. Vertical value is the one that matters. */
  focus: string;
}

// Values tuned against the live strip, not guessed: panels render about 3.9
// aspect, a far thinner band than it looks on paper, so a few points of drift
// turns a face into a shirt collar.
export const slides: Slide[] = [
  {
    image: blossomLean,
    alt: 'A student leaning forward outdoors, cherry blossom drifting past.',
    focus: '35% 16%', // face is high AND left; centring it pushed the face off-panel
  },
  {
    image: postPair,
    alt: 'Two characters close together against a blue sky, one holding a book.',
    focus: 'center 22%', // profile against the sky
  },
  {
    image: studyDesk,
    alt: 'A dim cinematic still of a student asleep at a desk covered in sticky notes.',
    focus: 'center 58%', // the figure only enters low in the frame
  },
  {
    image: newyear2569,
    alt: 'A colourful new-year illustration of a student in a floral shirt above stylised waves.',
    focus: 'center 30%', // torso and colour, clear of the lettering along the top
  },
  {
    image: comicMono,
    alt: 'A monochrome comic page: two students framed across several panels.',
    focus: '60% 16%', // the readable figure sits right of centre
  },
  {
    image: postSolo,
    alt: 'A single character in soft dappled light.',
    focus: 'center 18%', // face
  },
];
