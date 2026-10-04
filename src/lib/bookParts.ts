/**
 * A book's parts: its chapters, once a chapter says what it is (chapters.kind,
 * supabase/chapter-kind.sql). Vol. 2 is one book in two parts — a novel, then a
 * manga — and readers took them for two unrelated things. The overview lists the
 * parts (この本の構成), the page reader offers the novel's text only on its pages,
 * and the novel reader's last page leads on to the manga. Pure; tested in
 * bookParts.test.ts.
 */
import type { Chapter, ChapterKind, PageRec, Work } from './types';
import { sortedChapters } from './chapterOrder';
import { langLabel } from './bookInfo';

type UiLang = 'ja' | 'en' | 'th';
type T = (key: string) => string;
type PageLike = Pick<PageRec, 'id' | 'chapterId' | 'isBlank'>;

export interface BookPart {
  id: string;
  title: string; // as stored
  name: string; // the title without a leading 第N部 (partName)
  kind: ChapterKind | null;
  /** 1-based reader page numbers (blank leaves counted, as everywhere); null while locked */
  first: number | null;
  last: number | null;
  /** where "read this part" lands: its first readable page; null while locked */
  startId: string | null;
}

const KANJI = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 1–99 in kanji numerals: 1 → 一, 10 → 十, 12 → 十二, 20 → 二十. */
export function kanjiNumber(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99) return String(n);
  const tens = Math.floor(n / 10);
  return (tens ? (tens > 1 ? KANJI[tens] : '') + '十' : '') + KANJI[n % 10];
}

/** 第一部 / PART 1 — the n-th part (1-based). */
export function partLabel(n: number, ui: UiLang): string {
  return ui === 'ja' ? `第${kanjiNumber(n)}部` : `PART ${n}`;
}

/**
 * A part's title without the number the author already wrote into it
 * (「第二部　大人の重荷編」→「大人の重荷編」), so a label that prints the number
 * doesn't say it twice. A title that is nothing but the number stays whole.
 */
export function partName(title: string): string {
  const rest = title
    .trim()
    .replace(/^第\s*[0-9０-９一二三四五六七八九十百]+\s*部[\s　:：・\-–—]*/u, '')
    .replace(/^part\s*\d+\s*[:：.\-–—]?\s*/iu, '')
    .trim();
  return rest || title.trim();
}

/** The first readable page of a chapter (a part may open on a blank spacer leaf). */
export function partStart(chapterId: string, ordered: PageLike[]): string | null {
  const own = ordered.filter((p) => p.chapterId === chapterId);
  return (own.find((p) => !p.isBlank) ?? own[0])?.id ?? null;
}

/**
 * The parts in chapter order. `ordered` is the book's pages in reading order, or
 * null when they can't be seen (a locked book shows anon its cover row only — a
 * range worked out from that would read "p.1–1"): titles and kinds still list,
 * ranges and landing pages don't. With pages known, an empty chapter is left out,
 * as the contents list leaves it out.
 */
export function bookParts(chapters: Chapter[], ordered: PageLike[] | null): BookPart[] {
  const parts: BookPart[] = [];
  for (const ch of sortedChapters(chapters)) {
    const base = { id: ch.id, title: ch.title, name: partName(ch.title), kind: ch.kind ?? null };
    if (!ordered) {
      parts.push({ ...base, first: null, last: null, startId: null });
      continue;
    }
    let first = -1;
    let last = -1;
    ordered.forEach((p, i) => {
      if (p.chapterId !== ch.id) return;
      if (first < 0) first = i;
      last = i;
    });
    if (first < 0) continue;
    parts.push({ ...base, first: first + 1, last: last + 1, startId: partStart(ch.id, ordered) });
  }
  return parts;
}

/**
 * Whether the page reader offers 「小説はテキストで読めます」 on these pages: only
 * inside a novel part. A book whose chapters carry no kind can't tell its novel
 * pages from its manga, so it keeps offering it everywhere, as before the parts.
 */
export function novelHere(chapters: Chapter[], pages: Pick<PageRec, 'chapterId'>[]): boolean {
  if (!chapters.some((c) => c.kind)) return true;
  const novels = new Set(chapters.filter((c) => c.kind === 'novel').map((c) => c.id));
  return pages.some((p) => p.chapterId !== null && novels.has(p.chapterId));
}

/**
 * Where the novel reader's last page leads: the novel part's number and the manga
 * part after it. Null — a plain おわり — unless the book has both.
 */
export function novelSequel(
  chapters: Chapter[],
): { part: number; next: { id: string; title: string; part: number } } | null {
  const order = sortedChapters(chapters);
  const at = order.findIndex((c) => c.kind === 'novel');
  if (at < 0) return null;
  const nextAt = order.findIndex((c, i) => i > at && c.kind === 'manga');
  const i = nextAt >= 0 ? nextAt : order.findIndex((c) => c.kind === 'manga');
  if (i < 0) return null;
  return { part: at + 1, next: { id: order[i].id, title: order[i].title, part: i + 1 } };
}

/**
 * The language line under a part: a novel part names the languages its text reads
 * in (works.novel_langs), a manga part its translation (works.translations) — or
 * says it is the original only. The book's own language is never news.
 */
export function partNote(
  part: Pick<BookPart, 'kind'>,
  work: Pick<Work, 'book_lang' | 'translations' | 'novel_langs'>,
  ui: UiLang,
  t: T,
): string {
  const orig = work.book_lang?.trim() || null;
  const sep = ui === 'ja' ? '・' : ' / ';
  const other = (list: string[] | undefined) => (list ?? []).filter((c) => c && c !== orig);
  const names = (codes: string[]) => codes.map((c) => langLabel(c, ui)).join(sep);
  if (part.kind === 'novel') {
    const langs = other(work.novel_langs);
    if (langs.length) return t('part.readsIn').replace('{lang}', names(langs));
  } else {
    const langs = other(work.translations);
    if (langs.length) return t('rd.transOn').replace('{lang}', names(langs));
  }
  return orig ? t('part.origOnly').replace('{lang}', langLabel(orig, ui)) : '';
}

/**
 * The overview's hero for a book whose part is a novel with text (vol. 2): the
 * parts are the way in — the novel part (in the novel reader) and the manga part
 * after it (in the page reader) — instead of one 「読み始める」 that opened the
 * whole book as scanned pages, the Thai novel first. Indices into `parts`; manga
 * is -1 when the book has none. Null keeps the ordinary hero.
 */
export function partsHero(
  parts: Pick<BookPart, 'kind'>[],
  hasText: boolean,
): { novel: number; manga: number } | null {
  const novel = parts.findIndex((p) => p.kind === 'novel');
  if (novel < 0 || !hasText) return null;
  const after = parts.findIndex((p, i) => i > novel && p.kind === 'manga');
  return { novel, manga: after >= 0 ? after : parts.findIndex((p) => p.kind === 'manga') };
}
