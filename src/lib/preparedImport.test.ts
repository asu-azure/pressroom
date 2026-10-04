import { describe, expect, it } from 'vitest';
import { contentTypeOf, indexFolder, parseManifest } from './preparedImport';

const W = '2aa47aa0-29de-40e8-b204-eff9d4a66ef2';
const P = 'ee0a7ece-edcf-44ca-9807-7fbc0aa19bac';
const page = (col: string, name: string) => ({ file: `${P}/${name}`, path: `works/${W}/${P}/${name}`, page: P, column: col });

describe('parseManifest', () => {
  it('plans uploads and the page columns to write', () => {
    const plan = parseManifest(
      { work: W, files: [page('clean_path', 'clean-full.webp'), page('clean_med_path', 'clean-med.webp'), { file: 'novel/img01.webp', path: `works/${W}/novel/img01.webp` }] },
      W,
      [P],
    );
    expect(plan.errors).toEqual([]);
    expect(plan.entries).toHaveLength(3);
    expect(plan.updates.get(P)).toEqual({ clean_path: `works/${W}/${P}/clean-full.webp`, clean_med_path: `works/${W}/${P}/clean-med.webp` });
  });

  it('refuses a manifest for another work', () => {
    expect(parseManifest({ work: 'other', files: [page('clean_path', 'a.webp')] }, W, [P]).errors[0]).toMatch(/not this one/);
  });

  it('keeps every path inside the work and the page inside its folder', () => {
    const bad = [
      { file: 'a.webp', path: `works/other/${P}/a.webp`, page: P, column: 'clean_path' },
      { file: 'a.webp', path: `works/${W}/../x/a.webp` },
      { file: '../a.webp', path: `works/${W}/novel/a.webp` },
      { file: 'a.webp', path: `works/${W}/other-page/a.webp`, page: P, column: 'clean_path' },
      { file: 'a.webp', path: `works/${W}/${P}/a.webp`, page: 'not-a-page', column: 'clean_path' },
      { file: 'a.webp', path: `works/${W}/${P}/b.webp`, page: P, column: 'image_path' },
      { file: 'a.sql', path: `works/${W}/novel/a.sql` },
    ];
    const plan = parseManifest({ work: W, files: bad }, W, [P]);
    expect(plan.entries).toEqual([]);
    expect(plan.errors).toHaveLength(bad.length);
  });

  it('catches a path or a page column listed twice', () => {
    const plan = parseManifest({ work: W, files: [page('clean_path', 'a.webp'), page('clean_path', 'a.webp'), page('clean_path', 'b.webp')] }, W, [P]);
    expect(plan.errors).toHaveLength(2);
  });
});

describe('indexFolder', () => {
  it('finds the manifest and indexes files relative to it', () => {
    const files = [
      { name: 'manifest.json', webkitRelativePath: 'upload/manifest.json' },
      { name: 'clean-full.webp', webkitRelativePath: `upload/${P}/clean-full.webp` },
    ];
    const { manifest, byRel } = indexFolder(files);
    expect(manifest).toBe(0);
    expect(byRel.get(`${P}/clean-full.webp`)).toBe(1);
  });
});

it('content types', () => {
  expect(contentTypeOf('a/b.webp')).toBe('image/webp');
  expect(contentTypeOf('a/b.JPG')).toBe('image/jpeg');
  expect(contentTypeOf('a/b.png')).toBe('image/png');
});
