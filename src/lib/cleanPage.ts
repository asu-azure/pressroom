import type { PageRec } from './types';

/**
 * Which picture a page shows. Under a typeset translation a page with a clean
 * export (no lettering — supabase/clean-pages.sql) shows that instead, so no
 * Thai shows through the Japanese and the cover patches stand down. Only when
 * the page has bubbles: a clean picture with nothing lettered on it would be a
 * page of empty balloons. Thai mode, notes mode and pages without a clean
 * export keep the page itself.
 */
export function showsClean(page: PageRec, typesetOn: boolean): boolean {
  return typesetOn && Boolean(page.cleanUrl && page.cleanMedUrl) && (page.bubbles?.length ?? 0) > 0;
}

export function pictureOf(page: PageRec, typesetOn: boolean): { med: string; full: string; clean: boolean } {
  return showsClean(page, typesetOn)
    ? { med: page.cleanMedUrl!, full: page.cleanUrl!, clean: true }
    : { med: page.medUrl, full: page.fullUrl, clean: false };
}
