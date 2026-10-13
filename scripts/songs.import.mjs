/**
 * Where each song's data comes from, for scripts/import-ost.mjs. Paths are relative to this repo's
 * root. Home PC (since 9 Oct 2026): the music repo is the sibling checkout `../music` (C:/Users/user/asu/music);
 * the song folders with the final/ masters are the sibling folder `../music-files` (moved there from
 * Documents/personal work/claude_kun/music the same day).
 *
 *   timeline       the MV player's build of the song (movements, lyrics with kana, accent hits, notes)
 *   audio          the current master in the song's final/ folder (copied with --audio)
 *   motifMovement  index of the movement whose right hand sound.ts plays (motif.test.ts checks it)
 *
 * A song without an MV build can still be imported once it has a timeline of the same shape.
 */
export const SOURCES = {
  starfall: {
    timeline: '../music/visualizer/player2/songs/starfall-mv/timeline.json',
    audio: '../music-files/starfall/final/HQ_starfall_nocturne_v07k.mp3',
    motifMovement: 3, // IV. Hallway Echo
  },
};
