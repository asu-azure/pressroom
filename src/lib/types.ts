export type WorkStatus = 'ongoing' | 'complete' | 'oneshot';
export type Direction = 'rtl' | 'ltr';
export type Layout = 'single' | 'double';
export type Mode = 'scroll' | 'flip';
export type FitMode = 'height' | 'width';

/** One image in a character's profile gallery. */
export interface CastImage {
  url: string;
  caption?: string;
}

/**
 * A named speaker in a work's cast — reused across every bubble, and (when the
 * optional profile fields are filled in) shown on the overview's cast page.
 * Array order in `Work.characters` is the author's display order. A character
 * appears in the reader-facing roster only if it has profile content
 * (see `hasProfile`).
 */
export interface Character {
  id: string;
  name: string;
  color: string; // hex accent, colour-codes the bubble + tooltip + cast tile
  role?: string; // mono micro-label, e.g. "PROTAGONIST"
  iconUrl?: string; // square face crop for the roster tile
  images?: CastImage[]; // profile gallery, ordered
  bio?: string; // rich HTML — sanitized through richtext.ts before render
}

/** Cast-page visibility: bubble-only mob characters stay hidden automatically. */
export function hasProfile(c: Character): boolean {
  return Boolean(c.iconUrl || c.bio || c.images?.length);
}

/**
 * One translated speech bubble on a page. Coordinates are normalized 0..1 of
 * the page's intrinsic width/height, so they survive any resize/layout — the
 * reader maps them straight onto the aspect-ratio-locked `.si` box.
 */
export interface Bubble {
  id: string;
  panel: number; // 1-based panel grouping — drives the side-list headings
  charId: string | null; // → Work.characters[].id
  x: number;
  y: number;
  w: number;
  h: number;
  text: string; // the translation
}

/** Normalized 0..1 crop of the cover image shown in the library card. */
export interface CoverCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Series {
  id: string;
  title: string;
  slug: string;
  sort: number;
  created_at: string;
}

export interface Work {
  id: string;
  slug: string;
  title: string;
  description: string;
  series_id: string | null;
  status: WorkStatus;
  direction: Direction;
  default_layout: Layout;
  default_mode: Mode;
  tags: string[];
  foreword: string;
  characters: Character[];
  cover_page_id: string | null;
  cover_crop: CoverCrop | null;
  cover_solo: boolean;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: string;
  work_id: string;
  title: string;
  sort_key: string;
  cover_page_id: string | null;
  created_at: string;
}

/** DB row shape for `pages`. */
export interface PageRow {
  id: string;
  work_id: string;
  sort_key: string;
  spread_pair_id: string | null;
  chapter_id: string | null;
  width: number;
  height: number;
  image_path: string;
  med_path: string;
  thumb_path: string;
  note: string | null;
  bubbles: Bubble[];
  is_blank: boolean;
  created_at: string;
}

/** Page enriched with resolved public URLs — what the reader/arranger work with. */
export interface PageRec {
  id: string;
  sortKey: string;
  spreadPairId: string | null;
  chapterId: string | null;
  width: number;
  height: number;
  fullUrl: string;
  medUrl: string;
  thumbUrl: string;
  note: string | null;
  bubbles: Bubble[];
  isBlank: boolean;
}

export type Sheet =
  | { kind: 'single'; pages: [PageRec] }
  | { kind: 'spread'; pages: [PageRec, PageRec]; forced: boolean };

export interface ReaderSettings {
  layout: Layout;
  mode: Mode;
  fit: FitMode;
  translate: boolean;
}

/** A chapter's entry point in the resolved sheet list (reader TOC). */
export interface ChapterMark {
  id: string;
  title: string;
  sheet: number;
  coverUrl: string | null;
}
