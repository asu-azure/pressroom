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

export interface ImportPlacement {
  /** Chapter the new pages belong to (null = unassigned). */
  chapterId: string | null;
  /** Fractional keys of the pages the import lands between (null = open end). */
  afterKey: string | null;
  beforeKey: string | null;
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

const nextTick = () => new Promise((r) => setTimeout(r, 0));

/**
 * A fixed set of three canvases reused for every page. Canvas backing stores
 * are GPU-backed and freed lazily — allocating fresh ones per page piled up
 * hundreds of MB over a long import and froze the tab (the "page doesn't
 * respond" bug). Reuse bounds it to ~10 MB total; release() zeroes them when
 * the import ends.
 */
function makeScratch() {
  const full = document.createElement('canvas');
  const med = document.createElement('canvas');
  const thumb = document.createElement('canvas');
  const size = (c: HTMLCanvasElement, w: number, h: number) => {
    c.width = w;
    c.height = h;
  };
  const draw = (dst: HTMLCanvasElement, src: HTMLCanvasElement, longEdge: number) => {
    const scale = Math.min(1, longEdge / Math.max(src.width, src.height));
    size(dst, Math.max(1, Math.round(src.width * scale)), Math.max(1, Math.round(src.height * scale)));
    dst.getContext('2d')!.drawImage(src, 0, 0, dst.width, dst.height);
  };
  return {
    full,
    med,
    thumb,
    size,
    draw,
    release() {
      for (const c of [full, med, thumb]) {
        c.width = 0;
        c.height = 0;
      }
    },
  };
}

async function upload(path: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage
    .from(PAGES_BUCKET)
    .upload(path, blob, { cacheControl: CACHE_CONTROL, contentType: blob.type, upsert: true });
  if (error) throw new Error(`storage upload failed (${path}): ${error.message}`);
}

/**
 * Rasterize a PDF into per-page image variants and commit them page by page.
 * Strictly sequential: pdf.js renders in its worker, the main thread only
 * pays a short draw + encode per page, and each page is committed before the
 * next starts — an abort or failure resumes cleanly.
 */
export async function importPdf(
  file: File,
  workId: string,
  placement: ImportPlacement,
  hooks: ImportHooks,
): Promise<ImportResult> {
  const encoder = await detectEncoder();
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await loadingTask.promise;
  const total = doc.numPages;
  const keys = generateNKeysBetween(placement.afterKey, placement.beforeKey, total);
  const scratch = makeScratch();

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

      scratch.size(scratch.full, Math.round(viewport.width), Math.round(viewport.height));
      const ctx = scratch.full.getContext('2d', { alpha: false })!;
      // Manga pages assume a white sheet; PDFs can have transparent regions.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, scratch.full.width, scratch.full.height);
      // pdfjs v6 API: pass the canvas itself (canvasContext is the legacy path).
      await pdfPage.render({ canvas: scratch.full, viewport }).promise;
      pdfPage.cleanup();
      await nextTick();

      // Encode sequentially — parallel toBlob on three canvases stacked large
      // encode jobs and starved the main thread.
      const fullBlob = await toBlob(scratch.full, encoder.mime, encoder.quality);
      scratch.draw(scratch.med, scratch.full, MED_EDGE);
      const medBlob = await toBlob(scratch.med, encoder.mime, encoder.quality - 0.03);
      scratch.draw(scratch.thumb, scratch.full, THUMB_WIDTH);
      const thumbBlob = await toBlob(scratch.thumb, encoder.mime, 0.8);
      await nextTick();

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
        chapter_id: placement.chapterId,
        sort_key: keys[i - 1],
        width: scratch.full.width,
        height: scratch.full.height,
        ...paths,
      });
      if (error) throw new Error(`page ${i} insert failed: ${error.message}`);

      imported += 1;
      hooks.onPage(imported, total, URL.createObjectURL(thumbBlob));

      // Let the UI breathe between pages (paint the progress strip).
      await nextTick();
    }
  } finally {
    scratch.release();
    await loadingTask.destroy();
  }

  return { imported, total, aborted: false };
}

/** Keep the source PDF (private bucket), if the author opts in. */
export async function uploadOriginal(file: File, workId: string): Promise<void> {
  const { error } = await supabase.storage
    .from('originals')
    .upload(`works/${workId}/${file.name.replace(/[^\w.-]+/g, '_')}`, file, {
      cacheControl: CACHE_CONTROL,
      contentType: 'application/pdf',
      upsert: true,
    });
  if (error) throw new Error(`original upload failed: ${error.message}`);
}
