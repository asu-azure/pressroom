import type { PageRow, PageRec } from './types';

export const PAGES_BUCKET = 'pages';
export const ORIGINALS_BUCKET = 'originals';

/** Immutable per-page folder — reorders/renames never touch storage. */
export function pageFolder(workId: string, pageId: string): string {
  return `works/${workId}/${pageId}`;
}

/**
 * Public storage URL. Built by hand rather than via `supabase.storage
 * .getPublicUrl()` so this module stays free of the browser client — the
 * server-rendered <head> metadata on /w/[slug] imports it too, and pulling the
 * auth-bearing singleton into SSR just to concatenate a string is a bad trade.
 * Same shape richtext.ts already validates image sources against.
 */
export function publicUrl(path: string): string {
  const base = import.meta.env.PUBLIC_SUPABASE_URL ?? '';
  return `${base}/storage/v1/object/public/${PAGES_BUCKET}/${path}`;
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
