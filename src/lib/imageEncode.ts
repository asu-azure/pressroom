/**
 * Shared browser-side image encoding — the WebP-probe/downscale/upload
 * technique that pdfImport, foreImage and castImage each carried a private
 * copy of, consolidated. Client-only (canvas + DOM); never import from SSR.
 *
 * Safari's canvas.toBlob silently ignores 'image/webp', so the encoder is
 * probed once per session and everything falls back to JPEG together.
 */
import { supabase } from './supabase';

export const CACHE_CONTROL = '31536000';

export interface Encoder {
  mime: 'image/webp' | 'image/jpeg';
  ext: 'webp' | 'jpg';
  quality: number;
}

let cachedEncoder: Encoder | null = null;

export function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), mime, quality);
  });
}

/** Safari's canvas.toBlob silently ignores 'image/webp' — probe once. */
export async function detectEncoder(): Promise<Encoder> {
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

/** Downscale to a long-edge cap (never upscales), aspect preserved. */
export function downscale(img: HTMLImageElement | HTMLCanvasElement, longEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, longEdge / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Encode `canvas` with the probed encoder and upload to `bucket` at
 * `path`.`ext`. Returns the full storage path (with extension) — callers store
 * paths in rows and build URLs at read time (see storagePaths.publicUrl).
 * `quality` overrides the encoder default (e.g. med/thumb variants).
 */
export async function encodeAndUpload(
  bucket: string,
  path: string,
  canvas: HTMLCanvasElement,
  quality?: number,
): Promise<string> {
  const encoder = await detectEncoder();
  const blob = await toBlob(canvas, encoder.mime, quality ?? encoder.quality);
  const fullPath = `${path}.${encoder.ext}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(fullPath, blob, { cacheControl: CACHE_CONTROL, contentType: blob.type, upsert: true });
  if (error) throw new Error(`image upload failed: ${error.message}`);
  return fullPath;
}
