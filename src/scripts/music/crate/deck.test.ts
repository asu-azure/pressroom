import { describe, expect, it } from 'vitest';
import { caseTap, deckStep } from './deck';
import { YT_BUFFERING, YT_CUED, YT_ENDED, YT_PAUSED, YT_PLAYING, YT_UNSTARTED } from '../youtube';

describe('deckStep', () => {
  it('spins and opens the lid while the player plays', () => {
    expect(deckStep(YT_PLAYING, 0, 1)).toEqual({ spin: true, openLid: true, next: null, playing: true });
  });

  it('leaves the disc alone while buffering', () => {
    expect(deckStep(YT_BUFFERING, 0, 1).spin).toBeNull();
    expect(deckStep(YT_BUFFERING, 0, 1).openLid).toBe(false);
  });

  it('stops the disc when paused, cued or not started', () => {
    for (const s of [YT_PAUSED, YT_CUED, YT_UNSTARTED]) {
      const d = deckStep(s, 1, 3);
      expect(d.spin).toBe(false);
      expect(d.next).toBeNull();
      expect(d.openLid).toBe(false);
    }
  });

  it('goes on to the next track of the CD when one ends, and stops after the last', () => {
    expect(deckStep(YT_ENDED, 0, 3).next).toBe(1);
    expect(deckStep(YT_ENDED, 1, 3).next).toBe(2);
    expect(deckStep(YT_ENDED, 2, 3).next).toBeNull();
    expect(deckStep(YT_ENDED, 0, 1).next).toBeNull();
    expect(deckStep(YT_ENDED, 0, 1).spin).toBe(false);
  });
});

describe('caseTap', () => {
  it('starts the song the first time (the visitor asks for YouTube)', () => {
    expect(caseTap(false, false)).toBe('start');
  });
  it('pauses a playing song and resumes a paused one', () => {
    expect(caseTap(true, true)).toBe('pause');
    expect(caseTap(true, false)).toBe('resume');
  });
});
