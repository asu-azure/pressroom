/** One track of a CD, as /music hands it to the page. */
export interface CrateTrack {
  youtube: string;
  /** the video's YouTube still (960 px), shown until the player loads */
  poster: string;
  seconds: number;
}

/** One place in the crate, as /music hands it to the page (the `#crate-data` payload). */
export interface CrateSlot {
  slug: string;
  /** a CD, or an empty clear case that only fills the crate */
  kind: 'cd' | 'blank';
  title?: { ja: string; en: string };
  /** the jacket, 1024 px (the case in the crate and in your hands) */
  jacket?: string;
  /** the disc's print, 1024 px, fetched when the case is taken out */
  disc?: string;
  /** the CD's column in the spine atlas */
  spine?: number;
  tracks?: CrateTrack[];
}

export interface CratePayload {
  slots: CrateSlot[];
  /** the spine atlas (one column per CD) and how many columns it has */
  spines: string;
  spineColumns: number;
  /** the inside of the booklet, seen when a case lies open */
  inner: string;
}
