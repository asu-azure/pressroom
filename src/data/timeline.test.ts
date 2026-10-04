import { describe, expect, it } from 'vitest';
import * as timeline from './timeline';
import { BOOKS, ERAS, READING_NOTE, TIMELINE_SLUGS, inTimeline, partHref, pick, type TimelineBook } from './timeline';

const parts = ERAS.flatMap((e) => e.parts);
const strings = [
  READING_NOTE,
  ...ERAS.map((e) => e.title),
  ...parts.flatMap((p) => [p.part, p.note].filter((s) => s !== null)),
];

describe('timeline data', () => {
  it('names only the books it knows, by a real slug', () => {
    const known = new Set<TimelineBook>(Object.values(BOOKS));
    for (const p of parts) expect(known.has(p.book)).toBe(true);
    for (const b of Object.values(BOOKS)) {
      expect(b.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(b.arc.trim()).not.toBe('');
      expect(b.pages).toBeGreaterThan(1);
    }
    expect(new Set(TIMELINE_SLUGS).size).toBe(Object.keys(BOOKS).length);
  });

  it('keeps every range inside its book, in order', () => {
    for (const p of parts) {
      const [a, b] = p.pages;
      expect(Number.isInteger(a) && Number.isInteger(b)).toBe(true);
      expect(a).toBeGreaterThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(a);
      expect(b).toBeLessThanOrEqual(p.book.pages);
    }
  });

  it('never sets the same page of a book in two eras', () => {
    for (const book of Object.values(BOOKS)) {
      const ranges = parts.filter((p) => p.book === (book as TimelineBook)).map((p) => p.pages).sort((x, y) => x[0] - y[0]);
      for (let i = 1; i < ranges.length; i++) expect(ranges[i][0]).toBeGreaterThan(ranges[i - 1][1]);
    }
  });

  it('jumps vol. 1 from childhood straight to its epilogue at p.66 — the time skip', () => {
    const v1 = ERAS.map((e) => e.parts.filter((p) => p.book === (BOOKS.yakochu as TimelineBook)));
    expect(v1[0].map((p) => p.pages)).toEqual([[1, 65]]);
    expect(v1[1]).toEqual([]);
    expect(v1[2].map((p) => p.pages)).toEqual([[66, 75]]);
  });

  it('matches vol. 2’s two parts: the novel to p.65, the manga from p.66', () => {
    const v2 = parts.filter((p) => p.book === (BOOKS.amaagari as TimelineBook));
    expect(v2.map((p) => [p.kind, p.pages[0]])).toEqual([
      ['novel', 1],
      ['manga', 66],
    ]);
    expect(v2[0].pages[1]).toBe(65);
  });

  it('runs in story order, three eras, each with something to read', () => {
    expect(ERAS.map((e) => e.id)).toEqual(['childhood', 'junior-high', 'high-school']);
    for (const e of ERAS) expect(e.parts.length).toBeGreaterThan(0);
    expect(new Set(ERAS.map((e) => e.id)).size).toBe(ERAS.length);
  });

  it('has every line in Japanese and English', () => {
    for (const s of strings) {
      expect(s!.ja.trim()).not.toBe('');
      expect(s!.en.trim()).not.toBe('');
      expect(s!.ja).not.toBe(s!.en);
    }
  });

  it('says when, not where: the eras name no place', () => {
    expect(ERAS.map((e) => e.title.ja)).toEqual(['子ども時代', '3年後・中学1年', 'さらに3年後・高校時代']);
    const all = strings.flatMap((s) => [s!.ja, s!.en]).join(' ');
    expect(all).not.toMatch(/チャンタブリー|バンコク|Chanthaburi|Bangkok/);
  });

  it('promises no next book (the owner won’t commit to one)', () => {
    expect('NEXT' in timeline).toBe(false);
    const all = strings.flatMap((s) => [s!.ja, s!.en]).join(' ');
    expect(all).not.toMatch(/次は|予定|あとがき|planned|afterword|Frank's story/i);
  });

  it('calls the characters by their names, never the old spellings', () => {
    const en = strings.map((s) => s!.en).join(' ');
    expect(en).not.toMatch(/\bTam\b/);
    expect(en).toMatch(/\bTime\b/);
  });
});

describe('partHref / inTimeline / pick', () => {
  it('opens a manga part at its first page and a novel part in the novel reader', () => {
    expect(partHref(ERAS[0].parts[0])).toBe('/w/bdlfs-seasparkles/read?n=1');
    expect(partHref(ERAS[1].parts[0])).toBe('/w/bdlfs-skyafterrain/novel');
    expect(partHref(ERAS[2].parts[0])).toBe('/w/bdlfs-seasparkles/read?n=66');
    expect(partHref(ERAS[2].parts[1])).toBe('/w/bdlfs-skyafterrain/read?n=66');
  });

  it('knows which works it covers', () => {
    expect(inTimeline('bdlfs-seasparkles')).toBe(true);
    expect(inTimeline('some-other-book')).toBe(false);
    expect(inTimeline(null)).toBe(false);
  });

  it('reads English for anyone not reading Japanese', () => {
    expect(pick(READING_NOTE, 'ja')).toBe(READING_NOTE.ja);
    expect(pick(READING_NOTE, 'en')).toBe(READING_NOTE.en);
    expect(pick(READING_NOTE, 'th')).toBe(READING_NOTE.en);
  });
});
