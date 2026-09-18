// Subset Zen Maru Gothic (SIL OFL 1.1) for the tale theme.
//
//   node scripts/subset-zen.mjs <dir-with-ZenMaruGothic-*.ttf>
//
// The TTFs are ~3.8 MB each and are NOT committed; fetch them from
// https://github.com/google/fonts/tree/main/ofl/zenmarugothic. The subset keeps
// ASCII, common punctuation, all kana and every kanji that appears in src/ —
// author-written text from Supabase is NOT covered, which is why database text
// keeps the `.authored` system-font stack (see CLAUDE.md). Re-run after adding
// new kanji to any copy in src/.
import fs from 'node:fs';
import path from 'node:path';
import subsetFont from 'subset-font';

const srcDir = process.argv[2];
if (!srcDir) {
  console.error('usage: node scripts/subset-zen.mjs <dir-with-ttfs>');
  process.exit(1);
}

const chars = new Set();
const add = (from, to) => { for (let c = from; c <= to; c++) chars.add(String.fromCodePoint(c)); };
add(0x20, 0x7e);        // ASCII
add(0x3000, 0x30ff);    // CJK punctuation, hiragana, katakana
add(0xff01, 0xff5e);    // full-width forms
for (const c of '–—‘’“”…·×★☆♪〜・「」『』【】') chars.add(c);

const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(astro|svelte|ts|js|md)$/.test(e.name)) {
      for (const ch of fs.readFileSync(p, 'utf8')) {
        const cp = ch.codePointAt(0);
        if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff)) chars.add(ch);
      }
    }
  }
};
walk('src');
const text = [...chars].join('');

for (const w of ['Medium', 'Bold', 'Black']) {
  const input = fs.readFileSync(path.join(srcDir, `ZenMaruGothic-${w}.ttf`));
  const out = await subsetFont(input, text, { targetFormat: 'woff2' });
  const dest = `public/fonts/ZenMaruGothic-${w}.woff2`;
  fs.writeFileSync(dest, out);
  console.log(`${dest}  ${(out.length / 1024).toFixed(1)} kB`);
}
console.log(`${chars.size} characters`);
