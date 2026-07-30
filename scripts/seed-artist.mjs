/**
 * One-time seed: carry the retired asu-art gallery + bio into Pressroom.
 *
 * Run it yourself — it needs the studio credentials, which never live in this
 * repo and are never handled by tooling on your behalf:
 *
 *   cd pressroom
 *   $env:STUDIO_EMAIL    = 'you@example.com'
 *   $env:STUDIO_PASSWORD = '…'
 *   node scripts/seed-artist.mjs            # add --dry to preview
 *
 * It signs in as the author (so RLS lets the writes through), then for each
 * artwork produces the same three web-resolution variants the browser uploader
 * makes — full 1600 / med 900 / thumb 320 WebP — and inserts a row. Print-res
 * originals are NEVER uploaded; only these derivatives (see CLAUDE.md).
 *
 * Idempotent by title: an artwork whose title already exists is skipped, so a
 * failed run can simply be repeated.
 */
import { createClient } from '@supabase/supabase-js';
import { generateKeyBetween } from 'fractional-indexing';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/** Load .env without a dependency — the Supabase vars already live there. */
function loadEnv(file = '.env') {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim().replace(/^["']|["']$/g, '');
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}
loadEnv();

const ART_SRC = path.resolve(
  process.cwd(),
  '../asu-art/src/assets/illustrations',
);
const BUCKET = 'art';
const CACHE_CONTROL = '31536000';
const DRY = process.argv.includes('--dry');

/** Transcribed from asu-art/src/pages/index.astro — order is the curation order. */
const WORKS = [
  ['IMG_3311.jpg', 'Key art',          'Five petals of sunflowers', 'Two students in summer and school uniforms beneath the series title “Beyond the Door — 5 Petals of Sunflowers”.', true],
  ['IMG_3319.jpg', 'Character design', 'Two boys, one summer', 'Full-body character design sheet of two boys in casual school clothes on grid paper.'],
  ['IMG_3302.png', 'Illustration',     'Under a blue sky', 'Color portrait of a dark-haired student in a white shirt against a blue sky.'],
  ['IMG_3316.jpg', 'Illustration',     'Station light', 'Four students riding an escalator in a station, soft color rendering.'],
  ['IMG_3323.jpg', 'Illustration',     'Smile against the clouds', 'Portrait of a smiling boy against clouds, sunflowers framing the lower edge.'],
  ['IMG_3330.jpg', 'Manga',            'Aquarium tunnel', 'Monochrome manga panel: a boy gazing up inside an aquarium tunnel as a ray swims overhead.'],
  ['IMG_3307.jpg', 'Illustration',     'On the front line', 'Two characters in military-style uniforms, one aiming a rifle.'],
  ['IMG_3333.jpg', 'Manga',            'Sunrise at the shore', 'Monochrome scene of a boy on rocks at the shore as the sun rises over the sea.'],
  ['IMG_3328.jpg', 'Manga',            'Stairwell meeting', 'Monochrome manga panel: a student meets another on a dim stairwell.'],
  ['IMG_3304.jpg', 'Chibi',            'Tomato hats', 'Two chibi boys wearing tomato hats, comedic expressions.'],
  ['IMG_3325.jpg', 'Manga',            'Water surface', 'Monochrome manga panels: a boy in profile with water surface above.'],
  ['IMG_3313.jpg', 'Manga',            'Screentone drama', 'High-contrast monochrome manga panel with dramatic screentone.'],
  ['IMG_3310.jpg', 'Illustration',     'One page apart', 'Two boys in school uniforms sharing a book against a bright summer sky.'],
  ['IMG_3308.jpg', 'Illustration',     'Swing at noon', 'A grinning boy in a sailor-style uniform sitting on a chain swing against a yellow wall.'],
  ['IMG_3315.jpg', 'Illustration',     'Hearts, unexplained', 'A blushing boy in a school shirt surrounded by tiny floating hearts, caught off guard.'],
  ['IMG_3305.jpg', 'Character design', 'Sky-blue afternoon', 'Full-body illustration of a girl in a blue school uniform skirt and tie, hand on hip.'],
  ['IMG_3318.jpg', 'Character design', 'Two fits, one afternoon', 'Fashion-style illustration of two boys in casual streetwear poses on grid paper.'],
  ['IMG_3320.jpg', 'Illustration',     'Camp in the classroom', 'A group of scouts in uniform sharing snacks around pushed-together school desks.'],
  ['IMG_3309.jpg', 'Illustration',     'Songkran 2569', 'Sticker-style artwork of a boy in a flower shirt with a water gun for Thai new year 2569.'],
  ['IMG_3306.jpg', 'Chibi',            'Fast break, mini size', 'Chibi boy dribbling a basketball with a determined pout, sticker-style.'],
  ['IMG_3326.jpg', 'Manga',            'After the last bell', 'Monochrome manga scene of a boy playing an upright piano alone.'],
  ['IMG_3329.jpg', 'Manga',            'Taller than the flowers', 'Monochrome manga page of a hand ruffling a boy’s hair beside tall sunflowers.'],
  ['IMG_3332.jpg', 'Illustration',     'Thai schoolboy uniform, annotated', 'Illustrated guide to a Thai boys’ school uniform with handwritten Japanese annotations.'],
];

/**
 * The bio asu-art shipped. Marked as a DRAFT on purpose: it was AI-written
 * there (the source carries `// draft: review`), so it is seeded only so the
 * page is never empty. Rewrite it in Studio → ARTIST → PROFILE.
 */
const BIO_DRAFT =
  '<p><strong>Asu Azure</strong> — a digital illustrator from Thailand, telling stories one frame ' +
  'at a time. I grew up between languages, filling sketchbooks with the characters I wished I ' +
  'could meet.</p>' +
  '<p>Most of what I draw orbits one ongoing series, <em>“Beyond the Door — 5 Petals of ' +
  'Sunflowers”</em>: school hallways, quiet seas, and the small moments that decide who we ' +
  'become. Two boys, one summer, and a door that only opens if you dare to knock.</p>';

const CRAFT = [
  'Clip Studio Paint · fully digital',
  'Character design · illustration · cover art',
  'Manga · colour & monochrome',
];

const VARIANTS = [
  { name: 'full', edge: 1600, quality: 85 },
  { name: 'med', edge: 900, quality: 82 },
  { name: 'thumb', edge: 320, quality: 80 },
];

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. See the header of this file for usage.`);
    process.exit(1);
  }
  return v;
}

const url = need('PUBLIC_SUPABASE_URL');
const anon = need('PUBLIC_SUPABASE_ANON_KEY');

const supabase = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// A dry run writes nothing, so it needs no credentials — it exists to prove the
// source files resolve and the sharp pipeline produces sane sizes. Reads are
// public (anon SELECT on artist_profile / published artworks).
if (DRY) {
  console.log('Dry run — no credentials needed, nothing will be written.');
} else {
  const email = need('STUDIO_EMAIL');
  const password = need('STUDIO_PASSWORD');
  const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) {
    console.error(`Sign-in failed: ${authErr.message}`);
    process.exit(1);
  }
  console.log(`Signed in as ${email}`);
}

// --- profile ----------------------------------------------------------------
const { data: existing } = await supabase
  .from('artist_profile')
  .select('bio, craft')
  .eq('id', 1)
  .single();

if (existing?.bio?.trim()) {
  console.log('· profile: bio already written — left alone');
} else if (DRY) {
  console.log('· profile: would seed the draft bio + craft lines');
} else {
  const { error } = await supabase
    .from('artist_profile')
    .update({
      display_name: 'Asu Azure',
      bio: BIO_DRAFT,
      craft: CRAFT,
      links: { x: 'https://x.com/asukonpeki', x_handle: '@asukonpeki', email: 'gengenta15@gmail.com' },
    })
    .eq('id', 1);
  if (error) console.error(`! profile: ${error.message}`);
  else console.log('· profile: seeded (bio is a DRAFT — rewrite it in Studio)');
}

// --- gallery ----------------------------------------------------------------
const { data: rows, error: listErr } = await supabase
  .from('artworks')
  .select('title, sort_key')
  .order('sort_key', { ascending: true });
if (listErr) {
  console.error(`Could not read artworks: ${listErr.message}`);
  process.exit(1);
}
const have = new Set((rows ?? []).map((r) => r.title));
let lastKey = rows?.length ? rows[rows.length - 1].sort_key : null;

let added = 0;
let skipped = 0;

for (const [file, medium, title, alt, featured = false] of WORKS) {
  if (have.has(title)) {
    skipped += 1;
    continue;
  }
  const src = path.join(ART_SRC, file);
  let input;
  try {
    input = await readFile(src);
  } catch {
    console.error(`! ${title}: source not found at ${src}`);
    continue;
  }

  const id = crypto.randomUUID();
  const folder = `gallery/${id}`;
  const paths = {};
  let width = 0;
  let height = 0;

  try {
    for (const v of VARIANTS) {
      // withoutEnlargement: never upscale a small source (matches the browser path).
      const pipeline = sharp(input)
        .rotate() // honour EXIF orientation
        .resize({ width: v.edge, height: v.edge, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: v.quality });
      const { data: buf, info } = await pipeline.toBuffer({ resolveWithObject: true });
      if (v.name === 'full') {
        width = info.width;
        height = info.height;
      }
      const key = `${folder}/${v.name}.webp`;
      paths[v.name] = key;
      if (!DRY) {
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(key, buf, { cacheControl: CACHE_CONTROL, contentType: 'image/webp', upsert: true });
        if (error) throw new Error(`upload ${key}: ${error.message}`);
      }
    }

    const sortKey = generateKeyBetween(lastKey, null);
    if (!DRY) {
      const { error } = await supabase.from('artworks').insert({
        id,
        title,
        medium,
        alt,
        sort_key: sortKey,
        featured,
        published: true,
        width,
        height,
        image_path: paths.full,
        med_path: paths.med,
        thumb_path: paths.thumb,
      });
      if (error) {
        // Don't leave the three uploaded files orphaned.
        await supabase.storage.from(BUCKET).remove(Object.values(paths));
        throw new Error(error.message);
      }
    }
    lastKey = sortKey;
    added += 1;
    console.log(`· ${DRY ? 'would add' : 'added'} ${title} (${width}×${height})${featured ? ' ★ featured' : ''}`);
  } catch (err) {
    console.error(`! ${title}: ${err.message}`);
  }
}

console.log(`\nDone. ${added} added, ${skipped} already present.`);
if (!DRY) {
  console.log('Check /asu, then rewrite the bio in Studio → ARTIST → PROFILE.');
  await supabase.auth.signOut();
}
