/**
 * Turns the author's stored scene overrides into something /asu can render.
 *
 * Read path mirrors siteCopy.ts: registry fallbacks ←overridden by← the
 * `artist_profile.scenes` jsonb. Every branch degrades to something that
 * renders — an unknown slot key, a mode a slot does not offer, an artwork id
 * that has since been deleted, or a completely absent column all end up at the
 * slot's fallback rather than at an exception.
 *
 * Deliberately pure and dependency-free so it can be unit tested (scenes.test.ts)
 * and imported from Astro frontmatter without dragging in the Supabase client.
 */
import {
  SCENE_SLOTS,
  type SceneMode,
  type SceneSlot,
  type ScenesRecord,
} from '../data/sceneSlots';
import type { ArtworkRec } from './types';

export interface ResolvedScene {
  mode: SceneMode;
  /** The artworks to draw, already resolved. Empty for `photo` and `off`. */
  recs: ArtworkRec[];
}

export type ResolvedScenes = Record<string, ResolvedScene>;

/**
 * Auto-pick for a slot the author has not assigned art to.
 *
 * Spread across the gallery by slot position rather than always grabbing the
 * first pieces, so two plates never show the same drawing while other work sits
 * unused. Wraps, so it is safe with a one-piece gallery.
 */
function autoPick(works: ArtworkRec[], slotIndex: number, count: number): ArtworkRec[] {
  if (works.length === 0) return [];
  const out: ArtworkRec[] = [];
  for (let i = 0; i < count; i++) {
    out.push(works[(slotIndex + i) % works.length]);
  }
  return out;
}

/** The pieces a slot shows when the author has not chosen any. */
function fallbackArt(slot: SceneSlot, works: ArtworkRec[], slotIndex: number): ArtworkRec[] {
  // The character act has always led with the featured piece — keep that.
  if (slot.key === 'act.character') {
    const featured = works.find((w) => w.featured) ?? works[0];
    return featured ? [featured] : [];
  }
  // …and the selection act has always collaged the first two.
  if (slot.key === 'act.select') return works.slice(0, slot.count);
  return autoPick(works, slotIndex, slot.count);
}

export function resolveScenes(
  stored: unknown,
  works: ArtworkRec[],
): ResolvedScenes {
  const overrides: ScenesRecord =
    stored && typeof stored === 'object' && !Array.isArray(stored)
      ? (stored as ScenesRecord)
      : {};

  const byId = new Map(works.map((w) => [w.id, w]));
  const out: ResolvedScenes = {};

  SCENE_SLOTS.forEach((slot, slotIndex) => {
    const choice = overrides[slot.key];
    // A mode the slot does not offer is stale config, not content.
    const mode =
      choice && slot.modes.includes(choice.mode) ? choice.mode : slot.fallback;

    if (mode === 'photo' || mode === 'off') {
      out[slot.key] = { mode, recs: [] };
      return;
    }

    // Ids the author chose, minus any artwork deleted since.
    const chosen = (choice?.art ?? [])
      .map((id) => byId.get(id))
      .filter((w): w is ArtworkRec => Boolean(w))
      .slice(0, slot.count);

    const recs = chosen.length > 0 ? chosen : fallbackArt(slot, works, slotIndex);

    // Nothing left to draw (empty gallery): degrade to the photo where there is
    // one, otherwise show nothing. Never render an <img> with no source.
    if (recs.length === 0) {
      out[slot.key] = {
        mode: slot.modes.includes('photo') ? 'photo' : 'off',
        recs: [],
      };
      return;
    }

    out[slot.key] = { mode, recs };
  });

  return out;
}
