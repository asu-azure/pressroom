import { supabase } from './supabase';
import type { PageRow, PageRec } from './types';

export const PAGES_BUCKET = 'pages';
export const ORIGINALS_BUCKET = 'originals';

/** Immutable per-page folder — reorders/renames never touch storage. */
export function pageFolder(workId: string, pageId: string): string {
  return `works/${workId}/${pageId}`;
}

export function publicUrl(path: string): string {
  return supabase.storage.from(PAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function toPageRec(row: PageRow): PageRec {
  return {
    id: row.id,
    sortKey: row.sort_key,
    spreadPairId: row.spread_pair_id,
    chapterId: row.chapter_id,
    width: row.width,
    height: row.height,
    fullUrl: publicUrl(row.image_path),
    medUrl: publicUrl(row.med_path),
    thumbUrl: publicUrl(row.thumb_path),
    note: row.note,
    bubbles: row.bubbles ?? [],
    isBlank: row.is_blank ?? false,
  };
}
