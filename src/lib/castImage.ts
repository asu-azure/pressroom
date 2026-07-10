/**
 * Character-profile image uploads — same downscale + WebP-probe technique as
 * foreImage.ts, dropped into the public `pages` bucket under
 * works/{workId}/characters/{characterId}/. Returns public URLs to store in
 * the work's `characters` jsonb. Author-only via storage RLS.
 */
import { supabase } from './supabase';
import { PAGES_BUCKET, publicUrl } from './storagePaths';

const LONG_EDGE = 1600;
const ICON_SIZE = 320;
const CACHE_CONTROL = '31536000';

interface Encoder {
  mime: 'image/webp' | 'image/jpeg';
  ext: 'webp' | 'jpg';
  quality: number;
}

let cachedEncoder: Encoder | null = null;

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), mime, quality);
  });
}

/** Safari's canvas.toBlob silently ignores 'image/webp' — probe once. */
async function detectEncoder(): Promise<Encoder> {
  if (cachedEncoder) return cachedEncoder;
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const blob = await toBlob(probe, 'image/webp', 0.8).catch(() => null);
  cachedEncoder =
    blob && blob.type === 'image/webp'
      ? { mime: 'image/webp', ext: 'webp', quality: 0.85 }
      : { mime: 'image/jpeg', ext: 'jpg', quality: 0.87 };
  return cachedEncoder;
}

export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image load failed'));
    };
    img.src = url;
  });
}

async function uploadCanvas(canvas: HTMLCanvasElement, path: string): Promise<string> {
  const encoder = await detectEncoder();
  const blob = await toBlob(canvas, encoder.mime, encoder.quality);
  const fullPath = `${path}.${encoder.ext}`;
  const { error } = await supabase.storage
    .from(PAGES_BUCKET)
    .upload(fullPath, blob, { cacheControl: CACHE_CONTROL, contentType: blob.type, upsert: true });
  if (error) throw new Error(`cast image upload failed: ${error.message}`);
  return publicUrl(fullPath);
}

function castFolder(workId: string, characterId: string): string {
  return `works/${workId}/characters/${characterId}`;
}

/** Gallery image: downscaled to LONG_EDGE, keeps aspect. */
export async function uploadCastImage(file: File, workId: string, characterId: string): Promise<string> {
  const img = await loadImageFile(file);
  const scale = Math.min(1, LONG_EDGE / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return uploadCanvas(canvas, `${castFolder(workId, characterId)}/${crypto.randomUUID()}`);
}

/**
 * Face icon: bake a square crop of `img` (source-space rect sx,sy,ss — the
 * editor's drag/zoom stage supplies it) to ICON_SIZE and upload. Overwrites
 * the character's single `icon` file so re-crops never orphan storage.
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
  // Cache-bust with a short suffix: the path is stable-ish but each re-crop
  // gets a fresh name (1-year cacheControl would pin a stale face otherwise).
  return uploadCanvas(canvas, `${castFolder(workId, characterId)}/icon-${Date.now().toString(36)}`);
}
