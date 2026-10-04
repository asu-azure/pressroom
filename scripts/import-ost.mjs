#!/usr/bin/env node
/**
 * Import a song for the music pages from the music project.
 *
 *   node scripts/import-ost.mjs <slug> [--audio]
 *
 * The sources of each slug are in scripts/songs.import.mjs. Reads the song's MV player build
 * (timeline.json) and writes a trimmed copy to src/data/ost/<slug>.json — only what the pages use:
 * length, the movements, the lyrics with their kana, the accent hits, a 48-bar waveform for the
 * keychain, and the top line of the motif (so the UI-sound test can check sound.ts against it).
 * The MV player's engraving, credits and song title never come across: titles live in
 * src/data/songs.ts, and the music project's notes name the composer personally.
 *
 * With --audio it also copies the song's master to public/ost/<slug>.mp3.
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './songs.import.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
const cfg = SOURCES[slug];
if (!cfg) {
  console.error(`usage: node scripts/import-ost.mjs <slug> [--audio]   (slugs: ${Object.keys(SOURCES).join(', ')})`);
  process.exit(1);
}
const tl = JSON.parse(readFileSync(resolve(root, cfg.timeline), 'utf8'));

const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

const movements = tl.section_names.map((s) => ({
  bar: s.bar,
  name: s.name,
  ...(s.sub ? { sub: s.sub } : {}),
  t: r3(s.t),
}));

const lyrics = (tl.lyrics ?? []).map((l) => ({
  section: l.section,
  ja: l.ja,
  th: l.th,
  t0: r3(l.t0),
  t1: r3(l.t1),
  // [text, kana, t0, t1] — kanji carry their reading, so the page can ruby them
  chunks: l.chunks.map((c) => [c.text, c.kana, r3(c.t0), r3(c.t1)]),
}));

// The motif movement's right hand (staff 1), onset + pitch, for motif.test.ts.
let motifRh;
if (cfg.motifMovement != null) {
  const motif = movements[cfg.motifMovement];
  const end = movements[cfg.motifMovement + 1]?.t ?? tl.duration;
  motifRh = tl.notes.filter((n) => n[4] === 1 && n[1] >= motif.t - 0.001 && n[1] < end).map((n) => [r3(n[1]), n[3]]);
}

// --- keychain waveform: accent energy in 48 bins, eased and normalised -------
const BINS = 48;
const wave = Array(BINS).fill(0);
for (const [t, v] of tl.hits) wave[Math.min(BINS - 1, Math.floor((t / tl.duration) * BINS))] += v;
const peak = Math.max(...wave) || 1;
const waveOut = wave.map((v) => r2(0.18 + 0.82 * Math.sqrt(v / peak)));

const out = {
  id: slug,
  duration: r2(tl.duration),
  offset: tl.offset,
  movements,
  lyrics,
  hits: tl.hits.map(([t, v]) => [r2(t), r2(v)]),
  ...(motifRh ? { motifRh } : {}),
  wave: waveOut,
};

const dest = resolve(root, `src/data/ost/${slug}.json`);
writeFileSync(dest, JSON.stringify(out) + '\n');
console.log(`wrote ${dest} — ${movements.length} movements, ${lyrics.length} lyric lines, ${out.hits.length} hits`);

if (args.includes('--audio')) {
  mkdirSync(resolve(root, 'public/ost'), { recursive: true });
  copyFileSync(resolve(root, cfg.audio), resolve(root, `public/ost/${slug}.mp3`));
  console.log(`copied ${cfg.audio} → public/ost/${slug}.mp3`);
}
