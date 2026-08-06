import { describe, it, expect } from 'vitest';
import { resolveScenes } from './scenes';
import { SCENE_SLOTS } from '../data/sceneSlots';
import type { ArtworkRec } from './types';

function art(id: string, featured = false): ArtworkRec {
  return {
    id,
    title: id,
    medium: '',
    alt: '',
    sortKey: id,
    featured,
    published: true,
    width: 1200,
    height: 1600,
    fullUrl: `/${id}-full`,
    medUrl: `/${id}-med`,
    thumbUrl: `/${id}-thumb`,
  };
}

const works = [art('a'), art('b'), art('c', true), art('d')];

describe('resolveScenes', () => {
  it('gives every registered slot an answer', () => {
    const out = resolveScenes({}, works);
    for (const slot of SCENE_SLOTS) expect(out[slot.key]).toBeDefined();
  });

  it('falls back to each slot fallback with no overrides', () => {
    const out = resolveScenes({}, works);
    for (const slot of SCENE_SLOTS) expect(out[slot.key].mode).toBe(slot.fallback);
  });

  it('keeps the character act on the featured piece by default', () => {
    const out = resolveScenes({}, works);
    expect(out['act.character'].recs.map((w) => w.id)).toEqual(['c']);
  });

  it('keeps the selection act collaging the first two by default', () => {
    const out = resolveScenes({}, works);
    expect(out['act.select'].recs.map((w) => w.id)).toEqual(['a', 'b']);
  });

  it('honours an explicit choice', () => {
    const out = resolveScenes(
      { 'act.scatter': { mode: 'backdrop', art: ['d'] } },
      works,
    );
    expect(out['act.scatter'].mode).toBe('backdrop');
    expect(out['act.scatter'].recs.map((w) => w.id)).toEqual(['d']);
  });

  it('ignores a mode the slot does not offer', () => {
    // bio.plate has no photo to fall back to, so `photo` is not on its menu.
    const out = resolveScenes({ 'bio.plate': { mode: 'photo', art: [] } }, works);
    expect(out['bio.plate'].mode).toBe('plate');
  });

  it('drops artwork ids that no longer exist and re-picks', () => {
    const out = resolveScenes(
      { 'act.scatter': { mode: 'plate', art: ['deleted'] } },
      works,
    );
    expect(out['act.scatter'].mode).toBe('plate');
    expect(out['act.scatter'].recs).toHaveLength(1);
    expect(works.map((w) => w.id)).toContain(out['act.scatter'].recs[0].id);
  });

  it('never returns more art than the slot places', () => {
    const out = resolveScenes(
      { 'act.scatter': { mode: 'plate', art: ['a', 'b', 'c'] } },
      works,
    );
    expect(out['act.scatter'].recs).toHaveLength(1);
  });

  it('collages two distinct pieces where the slot takes two', () => {
    const out = resolveScenes({ 'act.select': { mode: 'plate', art: [] } }, works);
    expect(out['act.select'].recs).toHaveLength(2);
  });

  it('degrades an art mode to the photo when the gallery is empty', () => {
    const out = resolveScenes({ 'act.scatter': { mode: 'backdrop', art: [] } }, []);
    expect(out['act.scatter'].mode).toBe('photo');
    expect(out['act.scatter'].recs).toEqual([]);
  });

  it('degrades to nothing on a paper spread with an empty gallery', () => {
    const out = resolveScenes({}, []);
    expect(out['bio.plate'].mode).toBe('off');
    expect(out['craft.plate'].mode).toBe('off');
  });

  it('survives junk in the column', () => {
    for (const junk of [null, undefined, 'nonsense', 42, ['a']]) {
      const out = resolveScenes(junk, works);
      expect(out['act.film'].mode).toBe('photo');
    }
  });

  it('spreads auto-picked plates across the gallery rather than repeating one', () => {
    const out = resolveScenes({}, works);
    const bio = out['bio.plate'].recs[0].id;
    const craft = out['craft.plate'].recs[0].id;
    expect(bio).not.toBe(craft);
  });
});
