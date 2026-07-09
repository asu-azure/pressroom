import { generateNKeysBetween } from 'fractional-indexing';
import { supabase } from './supabase';
import { PAGES_BUCKET, pageFolder } from './storagePaths';

// Client-only module — pdf.js must never be imported in Astro frontmatter.
// The ?url import ships the worker that matches the installed pdfjs-dist,
// avoiding the classic API/worker version-mismatch error.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const LONG_EDGE = 1600;
const MED_EDGE = 900;
const THUMB_WIDTH = 320;
/** iOS Safari caps canvas area around 16.7 MP; stay far below it. */
const MAX_AREA = 8_000_000;
/** Immutable paths — cache aggressively to protect Supabase egress. */
const CACHE_CONTROL = '31536000';

export interface ImportHooks {
  /** Called after each page is fully committed (uploaded + row inserted). */
  onPage: (done: number, total: number, thumbUrl: string) => void;
  signal?: AbortSignal;
}

export interface ImportResult {
  imported: number;
  total: number;
  aborted: boolean;
}

interface Encoder {
  mime: 'image/webp' | 'image/jpeg';
  ext: 'webp' | 'jpg';
  quality: number;
}

let cachedEncoder: Encoder | null = null;

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

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), mime, quality);
  });
}

function downscale(src: HTMLCanvasElement, targetLongEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, targetLongEdge / Math.max(src.width, src.height));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(src.width * scale));
  out.height = Math.max(1, Math.round(src.height * scale));
  out.getContext('2d')!.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

async function upload(path: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage
    .from(PAGES_BUCKET)
    .upload(path, blob, { cacheControl: CACHE_CONTROL, contentType: blob.type, upsert: true });
  if (error) throw new Error(`storage upload failed (${path}): ${error.message}`);
}

/**
 * Rasterize a PDF into per-page image variants and commit them page by page.
 * Strictly sequential: pdf.js renders in its worker, so the main thread only
 * pays for the short canvas draw + encode per page — a 300-page import stays
 * responsive, and an abort/failure resumes cleanly (each page is committed
 * before the next starts).
 */
export async function importPdf(
  file: File,
  workId: string,
  hooks: ImportHooks,
): Promise<ImportResult> {
  const encoder = await detectEncoder();
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await loadingTask.promise;
  const total = doc.numPages;

  // Append after any existing pages (re-import / add-chapter case).
  const { data: lastRow } = await supabase
    .from('pages')
    .select('sort_key')
    .eq('work_id', workId)
    .order('sort_key', { ascending: false })
    .limit(1)
    .maybeSingle();
  const keys = generateNKeysBetween(lastRow?.sort_key ?? null, null, total);

  let imported = 0;
  try {
    for (let i = 1; i <= total; i++) {
      if (hooks.signal?.aborted) return { imported, total, aborted: true };

      const pdfPage = await doc.getPage(i);
      const base = pdfPage.getViewport({ scale: 1 });
      let scale = LONG_EDGE / Math.max(base.width, base.height);
      if (base.width * scale * (base.height * scale) > MAX_AREA) {
        scale = Math.sqrt(MAX_AREA / (base.width * base.height));
      }
      const viewport = pdfPage.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d', { alpha: false })!;
      // Manga pages assume a white sheet; PDFs can have transparent regions.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // pdfjs v6 API: pass the canvas itself (canvasContext is the legacy path).
      await pdfPage.render({ canvas, viewport }).promise;
      pdfPage.cleanup();

      const [fullBlob, medBlob, thumbBlob] = await Promise.all([
        toBlob(canvas, encoder.mime, encoder.quality),
        toBlob(downscale(canvas, MED_EDGE), encoder.mime, encoder.quality - 0.03),
        toBlob(downscale(canvas, THUMB_WIDTH), encoder.mime, 0.8),
      ]);

      const pageId = crypto.randomUUID();
      const folder = pageFolder(workId, pageId);
      const paths = {
        image_path: `${folder}/full.${encoder.ext}`,
        med_path: `${folder}/med.${encoder.ext}`,
        thumb_path: `${folder}/thumb.${encoder.ext}`,
      };
      await Promise.all([
        upload(paths.image_path, fullBlob),
        upload(paths.med_path, medBlob),
        upload(paths.thumb_path, thumbBlob),
      ]);

      const { error } = await supabase.from('pages').insert({
        id: pageId,
        work_id: workId,
        sort_key: keys[i - 1],
        width: canvas.width,
        height: canvas.height,
        ...paths,
      });
      if (error) throw new Error(`page ${i} insert failed: ${error.message}`);

      imported += 1;
      hooks.onPage(imported, total, URL.createObjectURL(thumbBlob));

      // Let the UI breathe between pages (paint the progress strip).
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    await loadingTask.destroy();
  }

  return { imported, total, aborted: false };
}

/** Keep the source PDF (private bucket), if the author opts in. */
export async function uploadOriginal(file: File, workId: string): Promise<void> {
  const { error } = await supabase.storage
    .from('originals')
    .upload(`works/${workId}/original.pdf`, file, {
      cacheControl: CACHE_CONTROL,
      contentType: 'application/pdf',
      upsert: true,
    });
  if (error) throw new Error(`original upload failed: ${error.message}`);
}
