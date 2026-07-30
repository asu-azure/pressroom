/**
 * Foreword image upload — downscale + encode to WebP (JPEG fallback on Safari,
 * same probe technique as pdfImport) and drop into the public `pages` bucket
 * under works/{workId}/foreword/. Returns the public URL to embed in the
 * foreword HTML. Author-only via storage RLS (bucket_id='pages' and is_author()).
 */
import { supabase } from './supabase';
import { PAGES_BUCKET, publicUrl } from './storagePaths';

const LONG_EDGE = 1600;
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

function loadImage(file: File): Promise<HTMLImageElement> {
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

export async function uploadForewordImage(file: File, workId: string): Promise<string> {
  const encoder = await detectEncoder();
  const img = await loadImage(file);
  const scale = Math.min(1, LONG_EDGE / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await toBlob(canvas, encoder.mime, encoder.quality);
  const path = `works/${workId}/foreword/${crypto.randomUUID()}.${encoder.ext}`;
  const { error } = await supabase.storage
    .from(PAGES_BUCKET)
    .upload(path, blob, { cacheControl: CACHE_CONTROL, contentType: blob.type, upsert: true });
  if (error) throw new Error(`foreword image upload failed: ${error.message}`);
  return publicUrl(path);
}
