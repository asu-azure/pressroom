/** One place in the crate, as /music hands it to the page (the `#crate-data` payload). */
export interface CrateSlot {
  slug: string;
  /** a song that is out, a song not out yet, or an empty case that only fills the crate */
  kind: 'song' | 'coming' | 'blank';
  title?: { ja: string; en: string };
  /** the cover, 1024 px (the disc's print) and 320 px (the list) */
  cover?: string;
  thumb?: string;
  audio?: string;
  href?: string;
  length?: string;
  movements?: number;
  album?: string;
}
