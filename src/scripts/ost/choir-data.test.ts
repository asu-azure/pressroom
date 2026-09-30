import { describe, it, expect } from 'vitest';
// plain JS, shared with the importer (scripts/)
import { kanaVowel } from '../../../scripts/kana-vowel.mjs';
import song from '../../data/ost/starfall.json';

describe('kana → vowel', () => {
  it('maps each row, in both scripts', () => {
    expect(kanaVowel('ほ')).toBe('o');
    expect(kanaVowel('し')).toBe('i');
    expect(kanaVowel('ゆ')).toBe('u');
    expect(kanaVowel('め')).toBe('e');
    expect(kanaVowel('か')).toBe('a');
    expect(kanaVowel('ナ')).toBe('a');
    expect(kanaVowel('ボ')).toBe('o');
    expect(kanaVowel('ん')).toBe('n');
  });
  it('ends on the last kana, and ー only lengthens', () => {
    expect(kanaVowel('きゃ')).toBe('a');
    expect(kanaVowel('さー')).toBe('a');
    expect(kanaVowel('—')).toBeNull();
  });
});

describe('imported choir', () => {
  const choir = song.choir as Record<'S' | 'A' | 'T' | 'B', [number, number, number, string][]>;

  it('has all four voices, in time order', () => {
    for (const v of ['S', 'A', 'T', 'B'] as const) {
      expect(choir[v].length).toBeGreaterThan(100);
      const onsets = choir[v].map((n) => n[0]);
      expect(onsets).toEqual([...onsets].sort((a, b) => a - b));
    }
  });

  it('sings the first line where the lyrics say: 星 (ほ → o) at 140.585 s', () => {
    const [t0, , , vowel] = choir.S[0];
    expect(t0).toBeCloseTo(140.585, 2);
    expect(vowel).toBe('o');
    expect(song.lyrics[0].t0).toBeCloseTo(t0, 2);
  });

  it('only uses mouth shapes the rabbits have', () => {
    const shapes = new Set(['a', 'i', 'u', 'e', 'o', 'n']);
    for (const v of ['S', 'A', 'T', 'B'] as const) for (const n of choir[v]) expect(shapes.has(n[3])).toBe(true);
  });
});
