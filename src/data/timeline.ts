/**
 * The timeline page (/timeline, components/timeline/Timeline.svelte): the books
 * in release order — that half comes from the database (works.released_on) — and,
 * here, the story's three eras with the part of each book that is set in them.
 *
 * Written spoiler-free on purpose (the owner's call): eras and points of view
 * only — no places, never what happens, and nothing about a book that isn't out
 * (the owner won't commit to the next one). Reading in release order is the
 * intended way; the books jump in time on purpose, and the page says so.
 *
 * Page numbers are READER pages — 1-based, the cover is p.1, blank leaves count —
 * as the page counter, the grid and `?n=` (lib/readerLink.ts) number them.
 * Checked against the books on 2026-10-04:
 *   夜光虫編, 79 pages: childhood up to p.65; p.66 opens on 「で、三年たって」 and
 *     the epilogue runs to p.75 — p.76 is ほだかだけ's guest illustration, p.77
 *     the afterword.
 *   雨上がりの空編, 84 pages: chapters 第一部 p.1–65 (novel) and 第二部 p.66–84
 *     (manga), whose story ends on p.82 「To be continued」 — p.83 is the
 *     afterword, p.84 the colophon.
 * Tested in timeline.test.ts. Titles of the books are the author's own and stay
 * as printed in every language (rendered `.authored`).
 */

export type L10n = { ja: string; en: string };

/** The series this page is about (works.series_title). */
export const SERIES = '扉の向こうはヒマワリ畑';

export interface TimelineBook {
  slug: string;
  /** the arc name as printed (works.series_label) */
  arc: string;
  /** reader pages in the book */
  pages: number;
}

export const BOOKS = {
  yakochu: { slug: 'bdlfs-seasparkles', arc: '夜光虫編', pages: 79 },
  amaagari: { slug: 'bdlfs-skyafterrain', arc: '雨上がりの空編', pages: 84 },
} as const satisfies Record<string, TimelineBook>;

export interface TimelinePart {
  book: TimelineBook;
  /** which part of the book, when it has parts (第一部 …) */
  part: L10n | null;
  kind: 'manga' | 'novel';
  /** reader pages, inclusive */
  pages: [number, number];
  /** whose eyes, when the book says so — never what happens */
  note: L10n | null;
}

export interface Era {
  id: string;
  title: L10n;
  parts: TimelinePart[];
}

export const ERAS: Era[] = [
  {
    id: 'childhood',
    title: { ja: '子ども時代', en: 'Childhood' },
    parts: [{ book: BOOKS.yakochu, part: null, kind: 'manga', pages: [1, 65], note: null }],
  },
  {
    id: 'junior-high',
    title: { ja: '3年後・中学1年', en: 'Three years later — first year of junior high' },
    parts: [
      {
        book: BOOKS.amaagari,
        part: { ja: '第一部', en: 'Part 1' },
        kind: 'novel',
        pages: [1, 65],
        note: null,
      },
    ],
  },
  {
    id: 'high-school',
    title: { ja: 'さらに3年後・高校時代', en: 'Three more years later — high school' },
    parts: [
      {
        book: BOOKS.yakochu,
        part: null,
        kind: 'manga',
        pages: [66, 75],
        note: { ja: 'タイム視点のエピローグ', en: "the epilogue, through Time's eyes" },
      },
      {
        book: BOOKS.amaagari,
        part: { ja: '第二部「大人の重荷編」', en: 'Part 2 「大人の重荷編」' },
        kind: 'manga',
        pages: [66, 82],
        note: { ja: 'フランク視点', en: "through Frank's eyes" },
      },
    ],
  },
];

/** Said once, at the top: release order is the way in. */
export const READING_NOTE: L10n = {
  ja: '刊行順に読むのがおすすめです。本は、わざと時間を行き来しています。',
  en: 'Reading them in release order is the intended way — the books jump back and forth in time on purpose.',
};

/** The works this page covers, so the shelf, the overview and the readers know when to link it. */
export const TIMELINE_SLUGS: readonly string[] = Object.values(BOOKS).map((b) => b.slug);

export const inTimeline = (slug: string | null | undefined): boolean => Boolean(slug && TIMELINE_SLUGS.includes(slug));

/** Where a part's button goes: the novel reader, or the page reader at its first page. */
export function partHref(p: TimelinePart): string {
  return p.kind === 'novel' ? `/w/${p.book.slug}/novel` : `/w/${p.book.slug}/read?n=${p.pages[0]}`;
}

/** The language a visitor reads these strings in: Thai visitors read the English chrome. */
export const pick = (s: L10n, ui: string): string => (ui === 'ja' ? s.ja : s.en);
