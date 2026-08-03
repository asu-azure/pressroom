import type { PageRow, PageRec, ArtworkRow, ArtworkRec } from './types';

export const PAGES_BUCKET = 'pages';
export const ORIGINALS_BUCKET = 'originals';
export const ART_BUCKET = 'art';

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

/** Public URL into the 'art' bucket (artist gallery + portrait). */
export function artUrl(path: string): string {
  const base = import.meta.env.PUBLIC_SUPABASE_URL ?? '';
  return `${base}/storage/v1/object/public/${ART_BUCKET}/${path}`;
}

/** Immutable per-artwork folder in the 'art' bucket. */
export function artworkFolder(artworkId: string): string {
  return `gallery/${artworkId}`;
}

export function toArtworkRec(row: ArtworkRow): ArtworkRec {
  return {
    id: row.id,
    title: row.title,
    medium: row.medium,
    alt: row.alt,
    sortKey: row.sort_key,
    featured: row.featured,
    published: row.published,
    width: row.width,
    height: row.height,
    fullUrl: artUrl(row.image_path),
    medUrl: artUrl(row.med_path),
    thumbUrl: artUrl(row.thumb_path),
  };
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
