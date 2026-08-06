/**
 * Where the author's own artwork may appear on /asu, besides the gallery.
 *
 * Same shape of idea as copyKeys.ts, and for the same three reasons: the
 * registry lives in CODE so the Studio form is generated from it and always
 * matches the page's scroll order; the DATABASE stores only overrides, so the
 * page can never render blank; and clearing a slot deletes its entry, which is
 * how RESET works.
 *
 * Adding a slot = one entry here + one `scene(...)` read in asu.astro. No
 * migration — `artist_profile.scenes` is a single jsonb column.
 */

/**
 * How a slot renders.
 *  - `photo`    the shipped scenery photograph, i.e. the page as it has always looked
 *  - `plate`    photo stays; artwork sits ON it as a framed, slightly rotated inset
 *  - `backdrop` artwork replaces the photograph behind the scrim
 *  - `off`      nothing (only offered where there is no photo to fall back to)
 */
export type SceneMode = 'photo' | 'plate' | 'backdrop' | 'off';

export interface SceneSlot {
  key: string;
  /** Heading the Studio groups this under — the section a visitor is looking at. */
  section: string;
  label: string;
  hint: string;
  /** Only these modes are offered; paper spreads have no photo to keep. */
  modes: SceneMode[];
  /** How many artworks the slot places. The selection act collages two. */
  count: 1 | 2;
  /** What the page already does today, before the author touches anything. */
  fallback: SceneMode;
}

/** In scroll order, so the Studio form reads like the visit. */
export const SCENE_SLOTS: SceneSlot[] = [
  {
    key: 'act.film',
    section: 'ACT I — FILM',
    label: 'Letterboxed opening',
    hint: 'The four cycling scenery photos right after your name.',
    modes: ['photo', 'plate', 'backdrop'],
    count: 1,
    fallback: 'photo',
  },
  {
    key: 'bio.plate',
    section: '02 — STORY',
    label: 'Beside your story',
    hint: 'The cream spread with your bio. Shows one piece next to the words; set NONE for text only.',
    modes: ['off', 'plate'],
    count: 1,
    fallback: 'plate',
  },
  {
    key: 'act.scatter',
    section: 'ACT II — SCATTER',
    label: 'Scatter backdrop',
    hint: 'The hillside photo behind the scattering title.',
    modes: ['photo', 'plate', 'backdrop'],
    count: 1,
    fallback: 'photo',
  },
  {
    key: 'act.character',
    section: 'ACT III — CHARACTER',
    label: 'Double-exposure subject',
    hint: 'The large figure blended over the street photo. Uses your featured piece unless you pick another.',
    modes: ['photo', 'plate', 'backdrop'],
    count: 1,
    fallback: 'plate',
  },
  {
    key: 'craft.plate',
    section: '04 — CRAFT',
    label: 'Beside the craft list',
    hint: 'The other cream spread, opposite what you offer. Set NONE for text only.',
    modes: ['off', 'plate'],
    count: 1,
    fallback: 'plate',
  },
  {
    key: 'act.select',
    section: 'ACT IV — SELECTION',
    label: 'Collage fragments',
    hint: 'Two small framed pieces pinned over the sky photo. Uses your first two pieces unless you pick.',
    modes: ['photo', 'plate', 'backdrop'],
    count: 2,
    fallback: 'plate',
  },
  {
    key: 'act.3d',
    section: 'ACT V — 3D TEXT',
    label: 'Dusk backdrop',
    hint: 'Behind the perspective title.',
    modes: ['photo', 'plate', 'backdrop'],
    count: 1,
    fallback: 'photo',
  },
  {
    key: 'act.grid',
    section: 'ACT VI — GRID',
    label: 'Finale backdrop',
    hint: 'The last act before your contact details.',
    modes: ['photo', 'plate', 'backdrop'],
    count: 1,
    fallback: 'photo',
  },
];

export const SLOT_BY_KEY = new Map(SCENE_SLOTS.map((s) => [s.key, s]));

/** Human labels for the mode buttons in the Studio. */
export const MODE_LABEL: Record<SceneMode, string> = {
  photo: 'PHOTO',
  plate: 'PLATE',
  backdrop: 'BACKDROP',
  off: 'NONE',
};

/** One slot's stored override. Absent key = use the fallback. */
export interface SceneChoice {
  mode: SceneMode;
  /** Artwork ids, up to the slot's `count`. */
  art: string[];
}

export type ScenesRecord = Record<string, SceneChoice>;
