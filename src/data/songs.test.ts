import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SONGS, songBySlug } from './songs';
import { FIELD_BY_KEY, SECTIONS } from './copyKeys';

// The catalogue is plain data written by hand next to files made by scripts. These checks catch the
// slips that would only show on the live page: a missing file, a movement with no liner note, a sky
// that runs out before the song does — and the Thai title, which the site never shows (owner's call).
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = join(root, 'src');

describe('the song catalogue', () => {
  it('has unique slugs that are safe in a URL', () => {
    const slugs = SONGS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it('gives coming songs nothing but a slug (blank charms, no title)', () => {
    for (const s of SONGS.filter((x) => x.status === 'coming')) {
      expect(Object.keys(s).sort()).toEqual(['slug', 'status']);
    }
  });

  for (const song of SONGS.filter((s) => s.status === 'out')) {
    describe(song.slug, () => {
      const data = JSON.parse(readFileSync(join(src, 'data/ost', `${song.data}.json`), 'utf8'));

      it('has its data, audio, cover and poster on disk', () => {
        expect(existsSync(join(root, 'public', song.audio!))).toBe(true);
        expect(existsSync(join(src, 'assets/ost', `${song.art!.cover}.jpg`))).toBe(true);
        expect(existsSync(join(src, 'assets/ost', `${song.art!.poster}.jpg`))).toBe(true);
      });

      it('keeps the imported data to the fields the pages use (no credits, no title)', () => {
        const allowed = new Set(['id', 'duration', 'offset', 'movements', 'lyrics', 'hits', 'motifRh', 'wave']);
        for (const k of Object.keys(data)) expect(allowed.has(k), `unexpected key ${k}`).toBe(true);
      });

      it('has a sky and a liner note for every movement', () => {
        expect(song.moods).toHaveLength(data.movements.length);
        data.movements.forEach((_: unknown, i: number) => {
          expect(FIELD_BY_KEY.has(`${song.copy}.m${i + 1}`), `${song.copy}.m${i + 1}`).toBe(true);
        });
      });

      it('points its highlight at a real movement', () => {
        if (song.highlight != null) expect(song.highlight).toBeLessThan(data.movements.length);
      });

      it('has one card per movement, and its small copy for the strip under the video', () => {
        const dir = join(root, 'public/ost', song.slug, 'cards');
        const cards = readdirSync(dir).filter((f) => f.endsWith('.webp'));
        expect(cards).toHaveLength(data.movements.length);
        for (const f of cards) expect(existsSync(join(dir, 'thumb', f)), `thumb/${f}`).toBe(true);
      });
    });
  }

  it('can find STARFALL, the song the shelf charm opens', () => {
    expect(songBySlug('starfall')?.status).toBe('out');
  });

  it('registers the copy groups the music pages render', () => {
    for (const id of ['musicRack', 'ostHero', 'ostList', 'ostNotes', 'ostMv', 'ostCredits']) {
      expect(SECTIONS.some((s) => s.id === id), id).toBe(true);
    }
  });
});

describe('the Thai title', () => {
  it('never appears in the site source', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(astro|svelte|ts|json|css|md)$/.test(f) && !p.endsWith('songs.test.ts') && readFileSync(p, 'utf8').includes('ดาวตก')) hits.push(p);
      }
    };
    walk(src);
    expect(hits).toEqual([]);
  });
});
