export type WorkStatus = 'ongoing' | 'complete' | 'oneshot';
export type Direction = 'rtl' | 'ltr';
export type Layout = 'single' | 'double';
export type Mode = 'scroll' | 'flip';
export type FitMode = 'height' | 'width';

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
  cover_page_id: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
}

/** DB row shape for `pages`. */
export interface PageRow {
  id: string;
  work_id: string;
  sort_key: string;
  spread_pair_id: string | null;
  width: number;
  height: number;
  image_path: string;
  med_path: string;
  thumb_path: string;
  note: string | null;
  created_at: string;
}

/** Page enriched with resolved public URLs — what the reader/arranger work with. */
export interface PageRec {
  id: string;
  sortKey: string;
  spreadPairId: string | null;
  width: number;
  height: number;
  fullUrl: string;
  medUrl: string;
  thumbUrl: string;
  note: string | null;
}

export type Sheet =
  | { kind: 'single'; pages: [PageRec] }
  | { kind: 'spread'; pages: [PageRec, PageRec]; forced: boolean };

export interface ReaderSettings {
  layout: Layout;
  mode: Mode;
  fit: FitMode;
}
