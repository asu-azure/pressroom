/**
 * The score's clock, shared by /ost and the homepage mini-player.
 *
 * The MP3 is the truth: `audio.currentTime` is what the visitor hears. But the
 * element only updates it every ~250 ms, so drawing from it directly makes
 * notes step instead of glide. The clock therefore runs on performance.now()
 * and `follow()` eases it toward the audio every frame — a hard re-anchor past
 * 80 ms of drift, otherwise 6 % of the difference. If the audio fails, the same
 * clock simply keeps running on performance.now() and the score plays silently.
 */
export class ScoreClock {
  /** score time (s) at `perfBase` */
  base: number;
  /** performance.now() when `base` was taken */
  perfBase = performance.now();
  playing = false;

  constructor(start = 0) {
    this.base = start;
  }

  /** current score time in seconds */
  now(): number {
    return this.playing ? this.base + (performance.now() - this.perfBase) / 1000 : this.base;
  }

  /** re-anchor at score time `t` (seek, start, resume) */
  set(t: number) {
    this.base = t;
    this.perfBase = performance.now();
  }

  start() {
    this.set(this.now());
    this.playing = true;
  }

  stop() {
    this.base = this.now();
    this.playing = false;
  }

  /** ease toward what the audio element says; call once per frame while it plays */
  follow(audio: HTMLAudioElement) {
    if (!this.playing || audio.paused) return;
    this.toward(audio.currentTime);
  }

  /** the same easing toward any player's reported time (the song page's YouTube video) */
  toward(t: number) {
    if (!this.playing) return;
    const diff = t - this.now();
    if (Math.abs(diff) > 0.08) this.set(t);
    else this.base += diff * 0.06;
  }
}
