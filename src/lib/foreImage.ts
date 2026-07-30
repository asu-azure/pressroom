/**
 * Foreword image upload — downscale + encode (shared helpers in imageEncode)
 * into the public `pages` bucket under works/{workId}/foreword/. Returns the
 * public URL to embed in the foreword HTML. Author-only via storage RLS.
 */
import { PAGES_BUCKET, publicUrl } from './storagePaths';
import { loadImageFile, downscale, encodeAndUpload } from './imageEncode';

const LONG_EDGE = 1600;

export async function uploadForewordImage(file: File, workId: string): Promise<string> {
  const img = await loadImageFile(file);
  const canvas = downscale(img, LONG_EDGE);
  const path = await encodeAndUpload(PAGES_BUCKET, `works/${workId}/foreword/${crypto.randomUUID()}`, canvas);
  return publicUrl(path);
}
