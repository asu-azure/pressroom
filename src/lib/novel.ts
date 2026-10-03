/**
 * The novel reader's pure helpers (components/novel/NovelReader.svelte).
 * Tested in novel.test.ts.
 */
import type { NovelBlock, NovelSection } from './types';

const LANGS = new Set(['th', 'ja', 'en']);

/** A block as stored, or null if it is junk. Text is trimmed; empty paragraphs drop. */
export function normalizeBlock(raw: unknown): NovelBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.t === 'gap') return { t: 'gap' };
  if (r.t === 'p') {
    const text = typeof r.text === 'string' ? r.text.replace(/\r/g, '').trim() : '';
    if (!text) return null;
    const b: NovelBlock = { t: 'p', text };
    if (r.align === 'center' || r.align === 'end') b.align = r.align;
    if (r.bold === true) b.bold = true;
    return b;
  }
  if (r.t === 'img') {
    const path = typeof r.path === 'string' ? r.path.trim() : '';
    const w = Number(r.w);
    const h = Number(r.h);
    if (!path || path.includes('..') || !(w > 0) || !(h > 0)) return null;
    const b: NovelBlock = { t: 'img', path, w, h };
    if (typeof r.alt === 'string' && r.alt.trim()) b.alt = r.alt.trim();
    return b;
  }
  return null;
}

/** Sections in reading order with clean bodies; a run of gaps collapses to one. */
export function normalizeSections(rows: unknown[]): NovelSection[] {
  return rows
    .filter((r): r is NovelSection => Boolean(r && typeof r === 'object' && LANGS.has((r as NovelSection).lang)))
    .map((r) => {
      const body: NovelBlock[] = [];
      for (const raw of Array.isArray(r.body) ? r.body : []) {
        const b = normalizeBlock(raw);
        if (!b) continue;
        if (b.t === 'gap' && (body.length === 0 || body[body.length - 1].t === 'gap')) continue;
        body.push(b);
      }
      while (body.length && body[body.length - 1].t === 'gap') body.pop();
      return { ...r, title: (r.title ?? '').trim(), body };
    })
    .sort((a, b) => (a.sort_key < b.sort_key ? -1 : a.sort_key > b.sort_key ? 1 : 0));
}

/** Which language to open: the asked one, else the reader's, else the first there is. */
export function pickLang(available: string[], asked: string | null, ui: string): string | null {
  if (asked && available.includes(asked)) return asked;
  if (available.includes(ui)) return ui;
  return available[0] ?? null;
}

// ---------------------------------------------------------------- progress

export interface NovelPlace {
  section: number;
  block: number;
}

export const placeKey = (workId: string, lang: string) => `pressroom:novel:${workId}:${lang}`;

export function parsePlace(raw: string | null, sections: NovelSection[]): NovelPlace | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<NovelPlace>;
    const s = Math.trunc(Number(p.section));
    const b = Math.trunc(Number(p.block));
    if (!Number.isFinite(s) || !Number.isFinite(b) || s < 0 || s >= sections.length) return null;
    return { section: s, block: Math.max(0, Math.min(b, Math.max(0, sections[s].body.length - 1))) };
  } catch {
    return null;
  }
}

/**
 * The table of contents. A section is a stretch of the book between page breaks in the
 * manuscript, not always a chapter: one without a title continues the chapter before it,
 * so only titled sections are listed — plus the opening, which may have none.
 */
export function chapters(sections: NovelSection[]): { index: number; title: string | null }[] {
  return sections
    .map((s, index) => ({ index, title: s.title || null }))
    .filter((c) => c.title || c.index === 0);
}

/** The chapter a section belongs to: the nearest titled section at or before it (else the opening). */
export function chapterOf(sections: NovelSection[], section: number): number {
  for (let i = Math.min(section, sections.length - 1); i > 0; i--) if (sections[i].title) return i;
  return 0;
}

/** Share of the whole text read up to a place — by characters, so long sections weigh more. */
export function progressOf(sections: NovelSection[], place: NovelPlace): number {
  const size = (b: NovelBlock) => (b.t === 'p' ? b.text.length : b.t === 'img' ? 200 : 20);
  let total = 0;
  let before = 0;
  sections.forEach((s, si) =>
    s.body.forEach((b, bi) => {
      const n = size(b);
      total += n;
      if (si < place.section || (si === place.section && bi < place.block)) before += n;
    }),
  );
  return total ? before / total : 0;
}

// ---------------------------------------------------------------- pages (縦書き)

/**
 * The page step for vertical text: the viewport's width rounded down to a
 * whole number of column pitches, so turning a page never leaves a column cut
 * in half at the edge. Never less than one column.
 */
export function pagePitch(viewportWidth: number, columnPitch: number): number {
  if (!(columnPitch > 0) || !(viewportWidth > 0)) return Math.max(1, viewportWidth);
  return Math.max(columnPitch, Math.floor(viewportWidth / columnPitch) * columnPitch);
}

/** Page count and the page that holds a given offset into the scroll width. */
export function pageCount(scrollWidth: number, page: number): number {
  return Math.max(1, Math.ceil((scrollWidth - 1) / page));
}

/**
 * Vertical text: short numbers and paired marks stand upright in one em
 * (縦中横) — "10", "!?", "!!". Everything else is plain text.
 */
export function tcyPieces(text: string): { t: string; tcy?: true }[] {
  const out: { t: string; tcy?: true }[] = [];
  const re = /(?<![0-9０-９])[0-9]{1,2}(?![0-9０-９])|[!?！？]{2}/g;
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > at) out.push({ t: text.slice(at, m.index) });
    out.push({ t: m[0].replace(/！/g, '!').replace(/？/g, '?'), tcy: true });
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push({ t: text.slice(at) });
  return out;
}
