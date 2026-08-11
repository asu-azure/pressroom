/**
 * Where the author's own artwork may appear on /asu, besides the gallery.
 *
 * Same shape of idea as copyKeys.ts, and for the same three reasons: the
 * registry lives in CODE so the Studio form is generated from it and always
 * matches the page's scroll order; the DATABASE stores only overrides, so the
 * page can never render blank; and clearing a slot deletes its entry, which is
 * how RESET works.
 *
 * Adding a slot = one entry here + one `scene(...)` read in the page. No
 * migration — `artist_profile.scenes` is a single jsonb column.
 *
 * Every slot declares its `page`, because six of them moved to /lookbook with
 * the acts and the Studio groups by page. A slot with no `page` will not show.
 */
import type { PageId } from './copyKeys';

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
  /** Which page this slot appears on — see PAGE_GROUPS in copyKeys.ts. */
  page: PageId;
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
    page: 'lookbook',
    section: 'ACT I — FILM',
    label: 'Letterboxed opening',
    hint: 'The four cycling scenery photos right after your name.',
    modes: ['photo', 'plate', 'backdrop'],
    count: 1,
    fallback: 'photo',
  },
  {
    key: 'bio.plate',
    page: 'asu',
    section: 'ABOUT — STORY',
    label: 'Beside your story',
    hint: 'The top half of the About section. Shows one piece next to the words; set NONE for text only.',
    modes: ['off', 'plate'],
    count: 1,
    fallback: 'plate',
  },
  {
    key: 'act.scatter',
    page: 'lookbook',
    section: 'ACT II — SCATTER',
    label: 'Scatter backdrop',
    hint: 'The hillside photo behind the scattering title.',
    modes: ['photo', 'plate', 'backdrop'],
    count: 1,
    fallback: 'photo',
  },
  {
    key: 'act.character',
    page: 'lookbook',
    section: 'ACT III — CHARACTER',
    label: 'Double-exposure subject',
    hint: 'The large figure blended over the street photo. Uses your featured piece unless you pick another.',
    modes: ['photo', 'plate', 'backdrop'],
    count: 1,
    fallback: 'plate',
  },
  {
    key: 'craft.plate',
    page: 'asu',
    section: 'ABOUT — CRAFT',
    label: 'Beside the craft list',
    hint: 'The lower half of the same About section, opposite what you offer. Set NONE for text only.',
    modes: ['off', 'plate'],
    count: 1,
    fallback: 'plate',
  },
  {
    key: 'act.select',
    page: 'lookbook',
    section: 'ACT IV — SELECTION',
    label: 'Collage fragments',
    hint: 'Two small framed pieces pinned over the sky photo. Uses your first two pieces unless you pick.',
    modes: ['photo', 'plate', 'backdrop'],
    count: 2,
    fallback: 'plate',
  },
  {
    key: 'act.3d',
    page: 'lookbook',
    section: 'ACT V — 3D TEXT',
    label: 'Dusk backdrop',
    hint: 'Behind the perspective title.',
    modes: ['photo', 'plate', 'backdrop'],
    count: 1,
    fallback: 'photo',
  },
  {
    key: 'act.grid',
    page: 'lookbook',
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
