import { describe, expect, it } from 'vitest';
import { TS, autoDir, fitBubble, normalizeBubble, units } from './typeset';
import type { Bubble } from './types';

// page 57 of 夜光虫編: a 1140×1600 page
const W = 1140;
const H = 1600;
const bub = (text: string, px: [number, number, number, number], extra: Partial<Bubble> = {}): Bubble => ({
  id: 'b',
  panel: 1,
  charId: null,
  x: px[0] / W,
  y: px[1] / H,
  w: (px[2] - px[0]) / W,
  h: (px[3] - px[1]) / H,
  text,
  ...extra,
});
const LONG = bub('でも最近は、痛いだけじゃもう振り向いてもらえないのかも', [788, 468, 1012, 802]);
const SHORT = bub('ねえ、タイム', [880, 880, 1020, 1080]);
const colText = (f: ReturnType<typeof fitBubble>) => f.lines.map((l) => l.map((p) => p.t).join(''));
const NO_START = /^[、。」』）ー…！？ぁぃぅぇぉっゃゅょァィゥェォッャュョ]/;
const NO_END = /[「『（]$/;

describe('fitBubble', () => {
  it('letters vertically, keeping every word and kinsoku', () => {
    const f = fitBubble(LONG, W, H);
    expect(f.dir).toBe('v');
    expect(f.overflow).toBe(false);
    expect(colText(f).join('')).toBe('でも最近は、痛いだけじゃもう振り向いてもらえないのかも');
    for (const c of colText(f)) {
      expect(c).not.toMatch(NO_START);
      expect(c).not.toMatch(NO_END);
    }
  });

  it('fits every column inside the balloon', () => {
    const f = fitBubble(LONG, W, H);
    const fs = (f.fs / 100) * H;
    const pad = TS.PAD * Math.min(LONG.w * W, LONG.h * H);
    expect((f.lines.length - 1) * fs * f.pitch + fs).toBeLessThanOrEqual(LONG.w * W - 2 * pad + 1e-6);
    for (const c of colText(f)) expect(c.length * fs).toBeLessThanOrEqual(LONG.h * H - 2 * pad + 1e-6);
  });

  it('keeps short lines at the base size, and only ever uses the steps', () => {
    expect(fitBubble(SHORT, W, H).fs).toBe(TS.BASE);
    const allowed = [...TS.STEPS.map((s) => +(TS.BASE * s).toFixed(3)), TS.MIN];
    for (const t of ['あ', 'そこまでは、まだしたくないんだ', 'ここにいる時間はまだいくらでもあるだろ。そのうち向こうから戻ってくるって……']) {
      expect(allowed).toContain(fitBubble(bub(t, [328, 1268, 502, 1462]), W, H).fs);
    }
  });

  it('never grows with more text, never shrinks with more room', () => {
    const box: [number, number, number, number] = [222, 132, 418, 302];
    let last = Infinity;
    for (let n = 1; n <= 40; n += 3) {
      const fs = fitBubble(bub('あ'.repeat(n), box), W, H).fs;
      expect(fs).toBeLessThanOrEqual(last);
      last = fs;
    }
    const text = '自分の不注意でケガしても、だんだん相手にしてくれなくなる';
    expect(fitBubble(bub(text, [100, 600, 300, 900]), W, H).fs).toBeGreaterThanOrEqual(
      fitBubble(bub(text, [100, 600, 250, 800]), W, H).fs,
    );
  });

  it('keeps the whole top-aligned block inside an elliptical balloon', () => {
    const f = fitBubble(LONG, W, H);
    const fs = (f.fs / 100) * H;
    const pad = TS.PAD * Math.min(LONG.w * W, LONG.h * H);
    const a = (LONG.w * W - 2 * pad) / 2;
    const b = (LONG.h * H - 2 * pad) / 2;
    const halfW = ((f.lines.length - 1) * fs * f.pitch + fs) / 2;
    const halfH = (Math.max(...colText(f).map((c) => c.length)) * fs) / 2;
    expect((halfW / a) ** 2 + (halfH / b) ** 2).toBeLessThanOrEqual(1 + 1e-6); // the corners are on or in the curve
  });

  it('fits less into an ellipse than into a rectangle of the same box', () => {
    const text = 'お母さんってさ、すごい生き物なんだよ。痛いときに呼べば来てくれる';
    const box: [number, number, number, number] = [895, 150, 1015, 345];
    const e = fitBubble(bub(text, box), W, H);
    const r = fitBubble(bub(text, box, { shape: 'rect' }), W, H);
    expect(r.fs).toBeGreaterThanOrEqual(e.fs);
  });

  it('honours a line break and sets !? and short numbers upright', () => {
    const f = fitBubble(bub('えっ!?\n10歳で', [100, 100, 400, 500]), W, H);
    expect(f.lines.length).toBeGreaterThanOrEqual(2);
    const pieces = f.lines.flat();
    expect(pieces).toContainEqual({ t: '!?', tcy: true });
    expect(pieces).toContainEqual({ t: '10', tcy: true });
    expect(colText(f)[0]).toBe('えっ!?');
  });

  it('goes horizontal for a wide box or Latin text, unless told', () => {
    expect(autoDir(bub('あいう', [0, 0, 400, 100]), W, H)).toBe('h');
    expect(autoDir(bub('BANG', [0, 0, 100, 200]), W, H)).toBe('h');
    expect(autoDir(bub('あいう', [0, 0, 400, 100], { dir: 'v' }), W, H)).toBe('v');
    expect(fitBubble(bub('あいう', [0, 0, 400, 100]), W, H).dir).toBe('h');
  });

  it('reports overflow instead of shrinking forever', () => {
    const f = fitBubble(bub('あ'.repeat(400), [500, 500, 540, 540]), W, H);
    expect(f.overflow).toBe(true);
    expect(f.fs).toBe(TS.MIN);
  });

  it('is deterministic', () => {
    expect(fitBubble(LONG, W, H)).toEqual(fitBubble(LONG, W, H));
  });
});

describe('units', () => {
  it('turns ASCII punctuation full-width and measures Latin runs sideways', () => {
    expect(units('a!').map((u) => u.t)).toEqual(['a', '！']);
    expect(units('...').map((u) => u.t)).toEqual(['…']);
    expect(units('OK').map((u) => u.em)).toEqual([1.5]);
  });
});

describe('normalizeBubble', () => {
  it('keeps a good bubble and clamps it onto the page', () => {
    const b = normalizeBubble({ id: 'x', panel: 2.4, charId: 'c', x: 0.9, y: -1, w: 0.5, h: 0.2, text: ' やあ ', shape: 'round', dark: true, dir: 'h', scale: 9, kind: 'prose' });
    expect(b).toEqual({ id: 'x', panel: 2, charId: 'c', x: 0.9, y: 0, w: 1 - 0.9, h: 0.2, text: 'やあ', shape: 'round', dark: true, dir: 'h', scale: 1.6, kind: 'prose' });
  });

  it('keeps cover patches on the page and drops broken ones', () => {
    const b = normalizeBubble({ id: 'x', x: 0.1, y: 0.1, w: 0.2, h: 0.2, text: 'a', cover: [[0.1, 0.1, 0.05, 0.05], [0.98, 0.5, 0.1, 0.1], [0, 0, 0, 0.1], 'junk', [1, 2]] });
    expect(b!.cover).toEqual([[0.1, 0.1, 0.05, 0.05], [0.98, 0.5, 1 - 0.98, 0.1]]);
    expect(normalizeBubble({ id: 'x', x: 0, y: 0, w: 0.1, h: 0.1, text: 'a', cover: [] })).not.toHaveProperty('cover');
  });

  it('drops unknown values and rejects junk', () => {
    expect(normalizeBubble({ id: 'x', x: 0, y: 0, w: 0.1, h: 0.1, text: 'a', shape: 'star', dir: 'z', dark: 'yes', scale: 1 })).toEqual({
      id: 'x', panel: 1, charId: null, x: 0, y: 0, w: 0.1, h: 0.1, text: 'a',
    });
    for (const junk of [null, 'x', {}, { id: 'x', text: '' }, { id: '', text: 'a', w: 0.1, h: 0.1 }, { id: 'x', text: 'a', w: 0, h: 0.1 }]) {
      expect(normalizeBubble(junk)).toBeNull();
    }
  });
});
