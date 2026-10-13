import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASES, SLOTS, releaseBySlug, cdPath, watchUrl, fmtTime, releaseSeconds } from './music';
import { COPY_FIELDS, FIELD_BY_KEY, SECTIONS } from './copyKeys';
import { LANGS } from '../lib/lang';

// The catalogue is plain data written by hand next to pictures made by a script (jackets.py). These
// checks catch the slips that would only show on the live page: a missing jacket or still, a CD
// without its credits, a credit the owner's rules forbid — and the Thai title, never shown.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = join(root, 'src');
const assets = join(src, 'assets/music');

describe('the CD catalogue', () => {
  it('is the three CDs, front of the crate first, with room left in the crate', () => {
    expect(RELEASES.map((r) => r.slug)).toEqual(['starfall', 'tailwind', 'lightward']);
    expect(SLOTS).toBeGreaterThan(RELEASES.length);
  });

  it('has unique slugs that are safe in a URL', () => {
    const slugs = RELEASES.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it('plays each video once, by a real YouTube id', () => {
    const ids = RELEASES.flatMap((r) => r.tracks.map((t) => t.youtube));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[\w-]{11}$/);
  });

  it('shows the lengths YouTube shows', () => {
    expect(RELEASES.flatMap((r) => r.tracks.map((t) => fmtTime(t.seconds)))).toEqual(['5:11', '5:41', '1:32', '5:41', '5:58']);
    expect(fmtTime(releaseSeconds(releaseBySlug('tailwind')!))).toBe('12:54');
  });

  it('keeps the titles as the owner wrote them (STARFALL is ナガレボシ, never the Thai title)', () => {
    expect(RELEASES.map((r) => `${r.title.ja} / ${r.title.en}`)).toEqual(['ナガレボシ / STARFALL', 'オイカゼ / TAILWIND', 'ヒカリノホウヘ / LIGHTWARD']);
    // オイカゼ is a single: the song, its 90-second size, its instrumental
    expect(releaseBySlug('tailwind')!.tracks.map((t) => t.version?.en ?? null)).toEqual([null, '90 second size', 'Instrumental']);
  });

  it('links a CD into the crate, and a track to YouTube from a moment', () => {
    expect(cdPath('starfall')).toBe('/music?cd=starfall');
    expect(watchUrl('rEDtqFOgd70')).toBe('https://www.youtube.com/watch?v=rEDtqFOgd70');
    expect(watchUrl('rEDtqFOgd70', 42.7)).toBe('https://www.youtube.com/watch?v=rEDtqFOgd70&t=42s');
    expect(releaseBySlug('nope')).toBeUndefined();
    expect(releaseBySlug(null)).toBeUndefined();
  });

  it('has every picture on disk: jacket, disc, spines, the booklet, a still per video', () => {
    for (const r of RELEASES) {
      expect(existsSync(join(assets, `${r.slug}-jacket.jpg`)), `${r.slug} jacket`).toBe(true);
      expect(existsSync(join(assets, `${r.slug}-disc.jpg`)), `${r.slug} disc`).toBe(true);
      for (const t of r.tracks) expect(existsSync(join(assets, 'posters', `${t.youtube}.jpg`)), `poster ${t.youtube}`).toBe(true);
    }
    expect(existsSync(join(assets, 'spines.jpg'))).toBe(true);
    expect(existsSync(join(assets, 'inner.jpg'))).toBe(true);
  });
});

describe('the words around the CDs', () => {
  it('registers the crate and one liner section per CD', () => {
    for (const id of ['musicCrate', 'musicStarfall', 'musicTailwind', 'musicLightward'])
      expect(SECTIONS.some((s) => s.id === id && s.page === 'music'), id).toBe(true);
  });

  it('gives every CD a note and credits in every language', () => {
    for (const r of RELEASES)
      for (const k of ['note', 'credits']) {
        const f = FIELD_BY_KEY.get(`music.${r.slug}.${k}`);
        expect(f, `music.${r.slug}.${k}`).toBeDefined();
        for (const l of LANGS) expect(f!.defaults[l].trim(), `music.${r.slug}.${k} ${l}`).not.toBe('');
      }
  });

  it('credits なぎ wherever a track is sung (the Japanese proofreading)', () => {
    for (const r of RELEASES.filter((x) => x.tracks.some((t) => t.sung)))
      for (const l of LANGS) expect(FIELD_BY_KEY.get(`music.${r.slug}.credits`)!.defaults[l]).toContain('なぎ');
  });

  it('credits Dvořák on オイカゼ', () => {
    const d = FIELD_BY_KEY.get('music.tailwind.credits')!.defaults;
    expect(d.ja).toContain('新世界より');
    expect(d.en).toContain('DVOŘÁK');
  });

  // v07j (4 Oct): these four left STARFALL's choir, their terms need permission; the credits must not name them
  it('credits only the voices that sing on ナガレボシ', () => {
    for (const key of ['music.starfall.voices', 'music.starfall.corpora', 'music.starfall.credits']) {
      for (const text of Object.values(FIELD_BY_KEY.get(key)!.defaults))
        for (const gone of ['Akane', 'Aoi', 'Tobari', 'JSUT', '琴葉', 'トバリ']) expect(text, `${key}: ${gone}`).not.toContain(gone);
    }
  });

  it('never calls the manga a doujinshi (the owner finds it odd) — 自作の漫画', () => {
    for (const f of COPY_FIELDS.filter((x) => x.key.startsWith('music.')))
      for (const text of Object.values(f.defaults)) {
        expect(text, f.key).not.toContain('同人');
        expect(text.toLowerCase(), f.key).not.toContain('doujin');
      }
  });

  it('calls ヒカリノホウヘ a homage, never a battle song', () => {
    for (const text of Object.values(FIELD_BY_KEY.get('music.lightward.note')!.defaults)) {
      expect(text).not.toMatch(/バトル|battle|บอส|ต่อสู้/i);
    }
  });

  it('has no song-page copy left (the page came down on 14 Oct 2026)', () => {
    expect(COPY_FIELDS.filter((f) => f.key.startsWith('ost.')).map((f) => f.key)).toEqual([]);
  });
});

describe('the Thai title', () => {
  it('never appears in the site source', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(astro|svelte|ts|json|css|md)$/.test(f) && !p.endsWith('music.test.ts') && readFileSync(p, 'utf8').includes('ดาวตก')) hits.push(p);
      }
    };
    walk(src);
    expect(hits).toEqual([]);
  });
});
