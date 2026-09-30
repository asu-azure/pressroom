#!/usr/bin/env node
/**
 * Import a song for /ost from the music project's MV player build.
 *
 *   node scripts/import-ost.mjs [path/to/player2/songs/<id>] [--audio]
 *
 * Default source: ../music/music/visualizer/player2/songs/starfall-mv (a sibling
 * checkout). Reads that build's timeline.json and writes a trimmed copy to
 * src/data/ost/starfall.json — only what the page uses: title, length, the
 * movements, the choir lyrics, the accent hits, and the top line of the motif
 * (so the UI-sound test can check sound.ts against it). The MV player's notes,
 * engraving and credits never come across.
 *
 * With --audio it also copies audio.mp3 to public/ost/starfall.mp3.
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const out = {
  id: tl.id,
  title: tl.title,
  duration: r2(tl.duration),
  offset: tl.offset,
  movements,
  lyrics,
  hits: tl.hits.map(([t, v]) => [r2(t), r2(v)]),
  motifRh,
};

const dest = resolve(root, 'src/data/ost/starfall.json');
writeFileSync(dest, JSON.stringify(out) + '\n');
console.log(`wrote ${dest} — ${movements.length} movements, ${lyrics.length} lyric lines, ${out.hits.length} hits`);

if (args.includes('--audio')) {
  mkdirSync(resolve(root, 'public/ost'), { recursive: true });
  copyFileSync(resolve(src, 'audio.mp3'), resolve(root, 'public/ost/starfall.mp3'));
  console.log('copied audio → public/ost/starfall.mp3');
}
