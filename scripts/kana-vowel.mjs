/**
 * Kana → the vowel a singer's mouth makes on it: 'a' | 'i' | 'u' | 'e' | 'o' | 'n'
 * ('n' = closed: ん, the small っ). Used by scripts/import-ost.mjs to give each
 * choir note a mouth shape; plain JS so the importer (Node) and the tests share it.
 * Unknown characters (and ー, which only lengthens) return null — the caller keeps
 * the previous vowel.
 */
const ROWS = {
  a: 'あかさたなはまやらわがざだばぱぁゃゎ',
  i: 'いきしちにひみりぎじぢびぴぃ',
  u: 'うくすつぬふむゆるぐずづぶぷぅゅゔ',
  e: 'えけせてねへめれげぜでべぺぇ',
  o: 'おこそとのほもよろをごぞどぼぽぉょ',
  n: 'んっ',
};

const TABLE = new Map();
for (const [v, chars] of Object.entries(ROWS)) {
  for (const ch of chars) {
    TABLE.set(ch, v);
    // the katakana twin sits 0x60 above in Unicode
    TABLE.set(String.fromCodePoint(ch.codePointAt(0) + 0x60), v);
  }
}

/** The vowel of the LAST kana in `text` (a syllable like "きゃ" ends on ゃ → 'a'). */
export function kanaVowel(text) {
  let v = null;
  for (const ch of text ?? '') v = TABLE.get(ch) ?? v;
  return v;
}
