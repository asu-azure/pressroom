# Song data for the music pages

## <slug>.json — /music/<slug> (starfall.json → /music/starfall)

Imported, never hand-edited: `node scripts/import-ost.mjs <slug> [--audio]`. Each slug's sources
are in `scripts/songs.import.mjs`: the MV player's build of the song (`timeline.json` in
`../music/music-repo/visualizer/player2/songs/<id>/`) and the master in the song's `final/`
folder. Kept: duration, movements, lyrics (chunks with kana), accent hits, the keychain's 48-bar
wave and the motif's right hand (for `motif.test.ts`). `--audio` also copies the master to
`public/ost/<slug>.mp3`. No title (the catalogue, `src/data/songs.ts`, owns titles) and no credits:
the music project's notes use a personal name that must not reach this repo.

## perd-pratu.json — /ost/tobira (the moving score, unlisted)

`perd-pratu.json` is the timeline for 「扉の向こう」 Main Theme (v05.1). It was exported
from the same Python source that rendered `public/ost/perd-pratu.mp3`, so each note's start
time is the moment it sounds in the MP3. Don't hand-edit the note rows; re-export them instead
(`ost_web_export.py` sits in the music project's `source_code/`).

| Key | Contents |
|---|---|
| `bars` | Start time of each bar, in seconds. The tempo map is already applied. |
| `sections` | `[sec, bar, EN, JA]` for each chapter. |
| `chords` | `[sec, symbol]`. |
| `stops` | `[[starts], [ends]]`, the stop-time bars. |
| `quotes` | `[start, end, label]`, the Beethoven windows. |
| `rh` `lh` `chip` `arp` `str` | Note rows, each `[startSec, durSec, midi, durBeats]`. |
| `drums` | `{ k, s, c }`, the onset times for kick, snare and crash. |

## Swapping in a new mix

1. Re-export the JSON. Replace the MP3 in `public/ost/`.
2. If the length changes, update `audioLen` in `src/pages/ost.astro`.
3. If a section label changes, re-subset the fonts (below).

## Fonts

`public/fonts/NotoSansJP-ost.woff2` and `DotGothic16-ost.woff2` are subsets of only the
characters used by `/ost` and the homepage ticker. After you add Japanese text to either,
re-subset:

```sh
# chars.txt = every character in ost.astro, scripts/ost/*.ts, this JSON and index.astro
pyftsubset NotoSansJP[wght].ttf --text-file=chars.txt --flavor=woff2 --layout-features='*' \
  --output-file=public/fonts/NotoSansJP-ost.woff2
pyftsubset DotGothic16-Regular.ttf --text-file=chars.txt --flavor=woff2 \
  --output-file=public/fonts/DotGothic16-ost.woff2
```

`PressroomNotation.woff2` is Bravura (SIL OFL 1.1), subset to the 18 SMuFL glyphs that
`render.ts` draws. Bravura has a Reserved Font Name, so the subset is renamed both in its
name table and in CSS.
