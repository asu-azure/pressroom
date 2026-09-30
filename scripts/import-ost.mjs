#!/usr/bin/env node
/**
 * Import a song for /ost from the music project's MV player build.
 *
 *   node scripts/import-ost.mjs [path/to/player2/songs/<id>] [--audio]
 *
 * Default source: ../music/music/visualizer/player2/songs/starfall-mv (a sibling
 * checkout). Reads that build's timeline.json and writes a trimmed copy to
 * src/data/ost/starfall.json — only what the page uses: length, the movements,
 * the choir lyrics, the accent hits, a 48-bar waveform for the keychain, each
 * choir voice's notes with the vowel sung (for the rabbits), and the top line of
 * the motif (so the UI-sound test can check sound.ts against it). The vowels
 * come from the vocal folder's choir_events.json, matched to the syllable
 * sounding at each timeline note's onset. The MV player's engraving, credits and song title never come
 * across — the site's title is the owner's: ナガレボシ / STARFALL.
 *
 * With --audio it also copies audio.mp3 to public/ost/starfall.mp3.
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { kanaVowel } from './kana-vowel.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const src = resolve(
  args.find((a) => !a.startsWith('--')) ?? resolve(root, '../music/music/visualizer/player2/songs/starfall-mv'),
);
const tl = JSON.parse(readFileSync(resolve(src, 'timeline.json'), 'utf8'));

const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

const movements = tl.section_names.map((s) => ({
  bar: s.bar,
  name: s.name,
  ...(s.sub ? { sub: s.sub } : {}),
  t: r3(s.t),
}));

const lyrics = tl.lyrics.map((l) => ({
  section: l.section,
  ja: l.ja,
  th: l.th,
  t0: r3(l.t0),
  t1: r3(l.t1),
  // [text, kana, t0, t1] — kanji carry their reading, so the page can ruby them
  chunks: l.chunks.map((c) => [c.text, c.kana, r3(c.t0), r3(c.t1)]),
}));

// The motif section's right hand (staff 1), onset + pitch, for motif.test.ts.
const motif = movements.find((m) => /motif/i.test(m.name));
const next = movements[movements.indexOf(motif) + 1];
const motifRh = tl.notes
  .filter((n) => n[4] === 1 && n[1] >= motif.t - 0.001 && n[1] < next.t)
  .map((n) => [r3(n[1]), n[3]]);

// --- keychain waveform: accent energy in 48 bins, eased and normalised -------
const BINS = 48;
const wave = Array(BINS).fill(0);
for (const [t, v] of tl.hits) wave[Math.min(BINS - 1, Math.floor((t / tl.duration) * BINS))] += v;
const peak = Math.max(...wave) || 1;
const waveOut = wave.map((v) => r2(0.18 + 0.82 * Math.sqrt(v / peak)));

// --- choir: every note of S/A/T/B, each with the vowel sung --------------------
const eventsPath = resolve(src, '../../../../songs/starfall-nocturne/vocal/choir_events.json');
const events = existsSync(eventsPath) ? JSON.parse(readFileSync(eventsPath, 'utf8')).voices : {};
const choir = { S: [], A: [], T: [], B: [] };
for (const seg of tl.choir) {
  for (const [, t0, t1, midi, voice] of seg.notes) {
    // the syllable sounding at this note's onset — a tied continuation keeps its vowel
    const hit = (events[voice] ?? []).find((e) => e.t0 <= t0 + 0.02 && e.t1 > t0 + 0.02);
    // no syllable on this note: a hum
    choir[voice]?.push([r3(t0), r3(t1), midi, (hit && kanaVowel(hit.kana)) || 'u']);
  }
}
// the soprano descant fills S wherever S is silent
for (const d of tl.descant ?? []) {
  const busy = choir.S.some(([a, b]) => a < d.t1 && b > d.t0);
  if (!busy) choir.S.push([r3(d.t0), r3(d.t1), d.midi, kanaVowel(d.k) || 'a']);
}
for (const v of Object.keys(choir)) choir[v].sort((a, b) => a[0] - b[0]);

const out = {
  id: tl.id,
  title: { ja: 'ナガレボシ', en: 'STARFALL' },
  duration: r2(tl.duration),
  offset: tl.offset,
  movements,
  lyrics,
  hits: tl.hits.map(([t, v]) => [r2(t), r2(v)]),
  motifRh,
  wave: waveOut,
  choir,
};

const dest = resolve(root, 'src/data/ost/starfall.json');
writeFileSync(dest, JSON.stringify(out) + '\n');
console.log(
  `wrote ${dest} — ${movements.length} movements, ${lyrics.length} lyric lines, ${out.hits.length} hits, ` +
    `choir S${choir.S.length} A${choir.A.length} T${choir.T.length} B${choir.B.length}`,
);

if (args.includes('--audio')) {
  mkdirSync(resolve(root, 'public/ost'), { recursive: true });
  copyFileSync(resolve(src, 'audio.mp3'), resolve(root, 'public/ost/starfall.mp3'));
  console.log('copied audio → public/ost/starfall.mp3');
}
