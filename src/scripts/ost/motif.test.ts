import { describe, it, expect } from 'vitest';
import data from './motif.fixture.json';
import { MOTIF, CHORDS } from '../sound';

// The UI sounds hardcode the motif so no page needs data to play a note. The fixture is the
// motif's right hand as the song's last import had it (starfall.json, v07k), kept when the song
// page and its data came down (14 Oct 2026; tag starfall-songpage-v1 has the importer).
describe('UI sound motif', () => {
  it('is the top line of IV. Hallway Echo, note for note', () => {
    const top = new Map<string, number>();
    for (const [t, midi] of data.motifRh as [number, number][]) {
      const k = t.toFixed(3);
      top.set(k, Math.max(top.get(k) ?? 0, midi));
    }
    const line = [...top.entries()].sort((a, b) => +a[0] - +b[0]).map(([, m]) => m);
    expect(line.slice(0, MOTIF.length)).toEqual(MOTIF);
  });

  it('opens on the G–A♭–G cell', () => {
    expect(MOTIF.slice(3, 6)).toEqual([79, 80, 79]);
  });

  it('keeps the hook harmony', () => {
    expect(CHORDS.open).toEqual([56, 60, 63, 67]); // A♭ C E♭ G
    expect(CHORDS.unlock).toEqual([60, 63, 67, 74]); // C E♭ G D
  });
});
