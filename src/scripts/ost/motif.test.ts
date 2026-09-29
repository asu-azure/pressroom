import { describe, it, expect } from 'vitest';
import data from '../../data/ost/perd-pratu.json';
import { MOTIF, CHORDS } from '../sound';

// The UI sounds hardcode the chorus hook so the page needs no JSON to play a
// note. If the song is remixed and re-exported, this is what notices.
describe('UI sound motif', () => {
  const chorus = (data.sections as [number, number, string, string][])[4][0];

  it('is the top line of the chorus, note for note', () => {
    const top = new Map<string, number>();
    for (const [t, , midi] of data.rh as number[][]) {
      if (t < chorus - 0.001 || t > chorus + 8) continue;
      const k = t.toFixed(3);
      top.set(k, Math.max(top.get(k) ?? 0, midi));
    }
    const line = [...top.entries()].sort((a, b) => +a[0] - +b[0]).map(([, m]) => m);
    expect(line.slice(0, MOTIF.length)).toEqual(MOTIF);
  });

  it('opens on the chords written under it', () => {
    const at = (t: number) =>
      (data.chords as [number, string][]).find(([s]) => Math.abs(s - t) < 0.01)?.[1];
    expect(at(chorus)).toBe('Dbmaj7');
    expect(CHORDS.open).toEqual([61, 65, 68, 72]); // D♭ F A♭ C
    expect(CHORDS.unlock).toEqual([63, 67, 70, 75]); // E♭ G B♭ E♭
  });
});
