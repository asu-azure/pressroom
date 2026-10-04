// The song page's movement strip (routes/music/song.astro) shows each movement's card small; the cards
// themselves are 1280×720 (~37 KB each), too much to load sixteen at once under the video. This writes
// 384×216 copies next to them: public/ost/<slug>/cards/thumb/NN.webp.
//
//   node scripts/card-thumbs.mjs <slug>
import { readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const slug = process.argv[2];
if (!slug) throw new Error('usage: node scripts/card-thumbs.mjs <slug>');
const dir = join('public', 'ost', slug, 'cards');
const out = join(dir, 'thumb');
mkdirSync(out, { recursive: true });
for (const f of readdirSync(dir).filter((f) => /^\d+\.webp$/.test(f)).sort()) {
  const info = await sharp(join(dir, f)).resize(384, 216, { fit: 'cover' }).webp({ quality: 74 }).toFile(join(out, f));
  console.log(f, `${(info.size / 1024).toFixed(1)} KB`);
}
