/**
 * Where each song's data comes from, for scripts/import-ost.mjs. Paths are relative to this repo's
 * root; the music folder is a sibling checkout (`../music`, one folder per song plus `music-repo`).
 *
 *   timeline       the MV player's build of the song (movements, lyrics with kana, accent hits, notes)
 *   audio          the current master in the song's final/ folder (copied with --audio)
 *   motifMovement  index of the movement whose right hand sound.ts plays (motif.test.ts checks it)
 *
 * A song without an MV build can still be imported once it has a timeline of the same shape.
 */
export const SOURCES = {
  starfall: {
    timeline: '../music/music-repo/visualizer/player2/songs/starfall-mv/timeline.json',
    audio: '../music/starfall/final/HQ_starfall_nocturne_v07j.mp3',
    motifMovement: 3, // IV. Hallway Echo
  },
};
