/**
 * What the case in your hands does when the YouTube player changes state. The player is the
 * truth: the disc spins while it plays, the lid opens if someone pressed play inside the player,
 * and a CD's next track follows the one that ended (オイカゼ 01 → 02 → 03). Pure, so it is tested
 * (deck.test.ts); liner.ts applies it.
 */
import { YT_BUFFERING, YT_ENDED, YT_PLAYING } from '../youtube';

export interface DeckStep {
  /** spin the disc (true/false), or leave it as it is (null) */
  spin: boolean | null;
  /** open the lid if it is shut */
  openLid: boolean;
  /** the track to load next, or null */
  next: number | null;
  /** the browser let it play: drop the "press play in the player" hint */
  playing: boolean;
}

export function deckStep(state: number, track: number, count: number): DeckStep {
  if (state === YT_PLAYING) return { spin: true, openLid: true, next: null, playing: true };
  // buffering between two moments of one song: the disc keeps turning rather than flicker
  if (state === YT_BUFFERING) return { spin: null, openLid: false, next: null, playing: false };
  if (state === YT_ENDED) return { spin: false, openLid: false, next: track + 1 < count ? track + 1 : null, playing: false };
  // paused, cued, unstarted
  return { spin: false, openLid: false, next: null, playing: false };
}

/** A tap on the case: what it means depends on the player. */
export type CaseTap = 'start' | 'pause' | 'resume';

export function caseTap(hasPlayer: boolean, playing: boolean): CaseTap {
  if (!hasPlayer) return 'start';
  return playing ? 'pause' : 'resume';
}
