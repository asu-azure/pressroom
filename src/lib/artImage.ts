/**
 * Artist-gallery image uploads — the same three-variant scheme as book pages
 * (full 1600 / med 900 / thumb 320), encoded with the shared imageEncode
 * helpers into the public `art` bucket. Author-only via storage RLS.
 *
 * Storage policy (per CLAUDE.md): only web-resolution derivatives are ever
 * uploaded — print-res originals stay on the author's machine.
 */
import { ART_BUCKET, artworkFolder, artUrl } from './storagePaths';
import { loadImageFile, downscale, encodeAndUpload } from './imageEncode';

const LONG_EDGE = 1600;
const MED_EDGE = 900;
const THUMB_EDGE = 320;
const PORTRAIT_EDGE = 1200;

export interface ArtworkUpload {
  imagePath: string;
  medPath: string;
  thumbPath: string;
  width: number;
  height: number;
}

/** One artwork → full/med/thumb variants at gallery/{artworkId}/. */
export async function uploadArtworkImages(file: File, artworkId: string): Promise<ArtworkUpload> {
  const img = await loadImageFile(file);
  const full = downscale(img, LONG_EDGE);
  const folder = artworkFolder(artworkId);
  const imagePath = await encodeAndUpload(ART_BUCKET, `${folder}/full`, full);
  const medPath = await encodeAndUpload(ART_BUCKET, `${folder}/med`, downscale(full, MED_EDGE), 0.82);
  const thumbPath = await encodeAndUpload(ART_BUCKET, `${folder}/thumb`, downscale(full, THUMB_EDGE), 0.8);
  return { imagePath, medPath, thumbPath, width: full.width, height: full.height };
}

/** The three storage paths an artwork owns — for delete-time cleanup. */
export function artworkPaths(row: { image_path: string; med_path: string; thumb_path: string }): string[] {
  return [row.image_path, row.med_path, row.thumb_path];
}

/**
 * Profile portrait. Each upload gets a fresh name — cacheControl is a year, and
 * a stable path would pin a stale face (same reasoning as cast icons).
 * Returns the storage path to save in artist_profile.portrait_path.
 */
export async function uploadPortrait(file: File): Promise<string> {
  const img = await loadImageFile(file);
  return encodeAndUpload(ART_BUCKET, `profile/portrait-${Date.now().toString(36)}`, downscale(img, PORTRAIT_EDGE));
}

/** Bio rich-text figure image. Returns a public URL for the editor to embed. */
export async function uploadBioImage(file: File): Promise<string> {
  const img = await loadImageFile(file);
  const path = await encodeAndUpload(ART_BUCKET, `profile/bio/${crypto.randomUUID()}`, downscale(img, LONG_EDGE));
  return artUrl(path);
}
