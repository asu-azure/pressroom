/**
 * Homepage contact strip — a slim rail of artwork between the hero and the shelf.
 *
 * TO ADD A PICTURE: drop it in `src/assets/showcase/`, import it, add one entry.
 * Order here is the order on the rail.
 *
 * The strip fixes HEIGHT and lets width fall out of each picture's own
 * proportions, so nothing is ever cropped — these range from 0.66 (tall comic
 * page) to 1.52 (wide still), and a fixed-ratio banner would have shown a
 * sliver of the tall ones.
 *
 * Sources are pre-downscaled to 2200px WebP (see the repo history): the site
 * never needs more than 1600px, and the untouched originals were 97MB.
 *
 * `animated: true` matters — those slides skip `astro:assets`, which resizes
 * with sharp and would keep only the first frame, freezing the animation.
 */
import type { ImageMetadata } from 'astro';

import friendsForever from '../assets/showcase/friends-forever.jpg';
import studyDesk from '../assets/showcase/study-desk.webp';
import newyear2569 from '../assets/showcase/newyear-2569.webp';
import comicMono from '../assets/showcase/comic-mono.webp';
import tomatoChibi from '../assets/showcase/tomato-chibi.webp';
import uniformStand from '../assets/showcase/uniform-stand.webp';
import greenOutfit from '../assets/showcase/green-outfit.webp';
import blossomLean from '../assets/showcase/blossom-lean.webp';
import postSolo from '../assets/showcase/post-solo.webp';
import postPair from '../assets/showcase/post-pair.webp';
import hugDoodle from '../assets/showcase/hug-doodle.webp';
import sketchLoop from '../assets/showcase/sketch-loop.webp';

export interface Slide {
  image: ImageMetadata;
  /** Described for screen readers. The strip itself carries no visible caption. */
  alt: string;
  /** Animated (multi-frame) — served untransformed so the animation survives. */
  animated?: boolean;
}

// Sequenced so neighbours contrast: wide next to tall, colour next to linework,
// rather than grouping the comic pages into one indistinguishable block.
export const slides: Slide[] = [
  {
    image: friendsForever,
    alt: 'Three schoolboys in blue uniforms leap arm-in-arm past a school gate under falling cherry blossom.',
  },
  {
    image: uniformStand,
    alt: 'A fair-haired student in a school uniform standing with hands on hips.',
  },
  {
    image: newyear2569,
    alt: 'A colourful new-year illustration: a student in a floral shirt sitting above stylised waves.',
  },
  {
    image: sketchLoop,
    alt: 'A looping pencil-line animation of a character sketch.',
    animated: true,
  },
  {
    image: blossomLean,
    alt: 'A student leaning forward outdoors, cherry blossom drifting past.',
  },
  {
    image: comicMono,
    alt: 'A monochrome comic page: two students framed across several panels.',
  },
  {
    image: tomatoChibi,
    alt: 'Two chibi characters wearing tomato hats, huddled together.',
  },
  {
    image: studyDesk,
    alt: 'A dim cinematic still of a student working at a desk covered in sticky notes.',
  },
  {
    image: postPair,
    alt: 'Artwork of two characters close together, framed as a social-media post.',
  },
  {
    image: hugDoodle,
    alt: 'A rough looping doodle animation of a character asking for a hug.',
    animated: true,
  },
  {
    image: greenOutfit,
    alt: 'A character in a green outfit, annotated with the artist’s handwritten notes.',
  },
  {
    image: postSolo,
    alt: 'Artwork of a single character in soft light, framed as a social-media post.',
  },
];
