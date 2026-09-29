/**
 * The browser half of the editable page copy (see siteCopy.ts for the server
 * read path). Kept in its own module on purpose: siteCopy.ts imports the
 * Supabase client and the whole copy registry, and a page script importing
 * applyCopy from there shipped both to every visitor of /asu and the shelf.
 * Nothing here may import from supabase, copyKeys' values, or the server helpers.
 */
import { LANGS, type Lang } from './lang';
import type { CopyDict } from '../data/copyKeys';
import { isRichSafe } from './richtext';

export type CopyBundle = Record<Lang, CopyDict>;

export const COPY_PAYLOAD_ID = 'site-copy';

/** Reads the JSON the page embedded for the client. Returns null if absent. */
export function readCopyPayload(doc: Document = document): CopyBundle | null {
  const el = doc.getElementById(COPY_PAYLOAD_ID);
  if (!el?.textContent) return null;
  try {
    const parsed = JSON.parse(el.textContent) as CopyBundle;
    return LANGS.every((l) => parsed?.[l]) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Swaps every marked node to `lang`.
 *
 * `data-i18n` sets text; `data-i18n-html` sets markup and is re-validated first,
 * so a tampered row loses its formatting rather than running.
 */
export function applyCopy(bundle: CopyBundle, lang: Lang, root: ParentNode = document): void {
  const dict = bundle[lang];
  if (!dict) return;

  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const value = dict[el.dataset.i18n ?? ''];
    if (typeof value === 'string') el.textContent = value;
  }

  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-html]')) {
    const value = dict[el.dataset.i18nHtml ?? ''];
    if (typeof value !== 'string') continue;
    if (isRichSafe(value)) el.innerHTML = value;
    else el.textContent = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Set `lang` on the document that actually owns `root`, not on whichever
  // document called us. Identical for a page switching its own language, but the
  // Studio's live preview passes an iframe: without this the preview keeps
  // Latin leading for Thai (global.css scopes that fix on html[lang='th']) and
  // the Studio's own <html lang> gets stomped to the previewed language.
  const doc = (root as Node).ownerDocument ?? (root as Document);
  doc.documentElement.lang = lang;
}
