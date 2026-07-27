/**
 * Homepage showcase plate — the artwork tipped in between the hero and the
 * shelf.
 *
 * TO ADD A PICTURE: drop the file in `src/assets/showcase/`, import it, and add
 * one entry below. Everything else follows — the plate turns into a slideshow
 * on its own once there is more than one slide (arrows, dots, keyboard nav and
 * the counter all appear at length > 1 and stay hidden at length 1).
 *
 * Images are imported, not referenced by path, so `astro:assets` optimises them
 * at build time (the homepage is prerendered): a 2 MB source ships as a few
 * hundred KB of WebP with a proper srcset.
 */
import type { ImageMetadata } from 'astro';
import friendsForever from '../assets/showcase/friends-forever.jpg';

export interface Slide {
  image: ImageMetadata;
  /** Described for screen readers. The plate itself carries no visible caption. */
  alt: string;
}

export const slides: Slide[] = [
  {
    image: friendsForever,
    alt: 'Three schoolboys in blue uniforms leap arm-in-arm past a school gate under falling cherry blossom, two of them holding blue folders. Signed “Friends Forever”.',
  },
];
