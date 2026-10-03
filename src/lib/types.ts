import type { ScenesRecord } from '../data/sceneSlots';

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
  name: string; // the NICKNAME — what the story (bubbles) and readers call them
  color: string; // hex accent, colour-codes the bubble + tooltip + cast tile
  realName?: string; // full/real name — shown smaller under the nickname
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
  // Typeset mode (lib/typeset.ts) — all optional, so older bubbles keep working.
  shape?: BubbleShape; // absent = 'ellipse'; 'none' = text with a halo over the art
  dark?: boolean; // a black balloon: dark fill, light text
  dir?: 'v' | 'h'; // absent = auto (vertical unless the box is much wider than tall)
  scale?: number; // the author's nudge on the base size, clamped 0.5–1.6
  /**
   * Where the original lettering sits, [x, y, w, h] in page fractions: each
   * patch is painted over (white, or black for a dark balloon) so none of it
   * shows, and the balloon's own outline stays. Without it the whole box gets
   * the soft balloon-shaped fill (hand-drawn bubbles in the Studio).
   */
  cover?: [number, number, number, number][];
  /** 'prose' = a novel page's whole text block, drawn as a translated page
      (reserved: the reader renders it from the novel translation onwards). */
  kind?: 'line' | 'prose';
}

export type BubbleShape = 'ellipse' | 'round' | 'rect' | 'none';

/** Normalized 0..1 crop of the cover image shown in the library card. */
export interface CoverCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Work {
  id: string;
  slug: string;
  title: string;
  description: string;
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
  read_locked: boolean; // pages behind a password (RLS enforces; see read-lock.sql)
  password_hint: string | null; // public by design — shown on the lock gate
  published: boolean;
  created_at: string;
  updated_at: string;
  // Book info + series (supabase/book-info.sql). Optional: rows and fallbacks
  // from before the migration render the overview as it always was.
  book_lang?: string | null; // language the book is written in, e.g. 'th'
  translations?: string[]; // languages a translation exists in, e.g. ['ja']
  formats?: BookFormat[];
  release_label?: string | null;
  content_warnings?: string[];
  series_title?: string | null; // same string = same series
  series_order?: number | null;
  series_kind?: 'main' | 'side' | null;
  series_label?: string | null; // the arc name, e.g. 夜光虫編
  novel_langs?: string[]; // languages its prose exists in as text (supabase/novel.sql)
}

export type BookFormat = 'manga' | 'novel' | 'illust';

/** One block of a novel section's text (supabase/novel.sql). */
export type NovelBlock =
  | { t: 'p'; text: string; align?: 'center' | 'end'; bold?: boolean }
  | { t: 'img'; path: string; w: number; h: number; alt?: string } // path in the pages bucket
  | { t: 'gap' }; // a blank line the author left on purpose

/** A work's prose in one language, one row per section (novel_sections). */
export interface NovelSection {
  id: string;
  work_id: string;
  lang: 'th' | 'ja' | 'en';
  sort_key: string;
  title: string;
  body: NovelBlock[];
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
  /** The part of the image this page shows, when that is not all of it — the
      reader's cover is the front of the wraparound (lib/coverCrop.ts). Width and
      height are then the crop's, in pixels. */
  crop?: CoverCrop;
}

export type Sheet =
  | { kind: 'single'; pages: [PageRec] }
  | { kind: 'spread'; pages: [PageRec, PageRec]; forced: boolean };

export interface ReaderSettings {
  layout: Layout;
  mode: Mode;
  fit: FitMode;
  translate: boolean;
  /** How translations show: lettered into the balloons, or as hotspots + a list. */
  translateMode: TranslateMode;
  /** Flip mode turns pages with a paper curl (scripts/curl.ts). */
  curl: boolean;
}

export type TranslateMode = 'typeset' | 'notes';

/** A chapter's entry point in the resolved sheet list (reader TOC). */
export interface ChapterMark {
  id: string;
  title: string;
  sheet: number;
  coverUrl: string | null;
  /** object-position keeping a cropped cover's front in view (lib/coverCrop.ts) */
  coverFocus?: string;
}

/** Social/contact links on the artist profile (all optional). */
export interface ArtistLinks {
  x?: string; // full URL
  x_handle?: string; // display form, e.g. "@asukonpeki"
  email?: string;
}

/** The /asu page's editable singleton (artist_profile row 1). */
export interface ArtistProfile {
  id: number;
  display_name: string;
  bio: string; // rich HTML — sanitized through richtext.ts before render
  portrait_path: string | null; // path in the 'art' bucket
  craft: string[];
  links: ArtistLinks;
  commissions_open: boolean;
  /**
   * Whether to mention commissions at all — separate from open/closed, which
   * only picks WHICH line to show. Optional because rows predate the column
   * (supabase/scenes.sql); readers default it to true.
   */
  commissions_show?: boolean;
  /**
   * Per-section artwork placement overrides, keyed by scene slot. Registry and
   * shape live in src/data/sceneSlots.ts; resolved by src/lib/scenes.ts.
   */
  scenes?: ScenesRecord;
  updated_at: string;
}

/** DB row shape for `artworks`. */
export interface ArtworkRow {
  id: string;
  title: string;
  medium: string; // drives the filter chips on /asu
  alt: string;
  sort_key: string;
  featured: boolean;
  published: boolean;
  width: number;
  height: number;
  image_path: string;
  med_path: string;
  thumb_path: string;
  created_at: string;
}

/** Artwork enriched with resolved public URLs (see storagePaths.artUrl). */
export interface ArtworkRec {
  id: string;
  title: string;
  medium: string;
  alt: string;
  sortKey: string;
  featured: boolean;
  published: boolean;
  width: number;
  height: number;
  fullUrl: string;
  medUrl: string;
  thumbUrl: string;
}
