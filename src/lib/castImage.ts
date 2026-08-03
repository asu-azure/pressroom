/**
 * Character-profile image uploads — shared downscale/encode via imageEncode,
 * dropped into the public `pages` bucket under
 * works/{workId}/characters/{characterId}/. Returns public URLs to store in
 * the work's `characters` jsonb. Author-only via storage RLS.
 */
import { PAGES_BUCKET, publicUrl } from './storagePaths';
import { loadImageFile, downscale, encodeAndUpload } from './imageEncode';

const LONG_EDGE = 1600;
const ICON_SIZE = 320;

export { loadImageFile };

function castFolder(workId: string, characterId: string): string {
  return `works/${workId}/characters/${characterId}`;
}

/** Gallery image: downscaled to LONG_EDGE, keeps aspect. */
export async function uploadCastImage(file: File, workId: string, characterId: string): Promise<string> {
  const img = await loadImageFile(file);
  const canvas = downscale(img, LONG_EDGE);
  const path = await encodeAndUpload(PAGES_BUCKET, `${castFolder(workId, characterId)}/${crypto.randomUUID()}`, canvas);
  return publicUrl(path);
}

/**
 * Face icon: bake a square crop of `img` (source-space rect sx,sy,ss — the
 * editor's drag/zoom stage supplies it) to ICON_SIZE and upload. Each re-crop
 * gets a fresh name (1-year cacheControl would pin a stale face otherwise).
 */
export async function uploadCastIcon(
  img: HTMLImageElement,
  crop: { sx: number; sy: number; ss: number },
  workId: string,
  characterId: string,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  canvas
    .getContext('2d')!
    .drawImage(img, crop.sx, crop.sy, crop.ss, crop.ss, 0, 0, ICON_SIZE, ICON_SIZE);
  const path = await encodeAndUpload(
    PAGES_BUCKET,
    `${castFolder(workId, characterId)}/icon-${Date.now().toString(36)}`,
    canvas,
  );
  return publicUrl(path);
}
