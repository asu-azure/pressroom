/**
 * Loading and applying the editable page copy.
 *
 * Read path (server):  registry defaults  ←overridden by←  `site_copy` rows.
 * Read path (client):  the same three dictionaries, embedded as JSON, swapped
 *                      over `[data-i18n]` / `[data-i18n-html]` when the visitor
 *                      changes language — the mechanism the retired asu-art
 *                      one-pager used, kept intact.
 *
 * A Supabase failure is NOT an error here. `/asu` is content-bearing, so it
 * degrades to the shipped defaults and still renders a complete page — never a
 * blank one and never a 500.
 */
import { supabaseServer } from './supabaseServer';
import { isLang, LANGS, type Lang } from './lang';
import { COPY_FIELDS, FIELD_BY_KEY, defaultsFor, type CopyDict } from '../data/copyKeys';
import { isRichSafe, richForServer } from './richtext';

export type CopyBundle = Record<Lang, CopyDict>;

/** Keys whose value is HTML rather than a plain line. */
const RICH_KEYS = new Set(COPY_FIELDS.filter((f) => f.type === 'rich').map((f) => f.key));

export const COPY_PAYLOAD_ID = 'site-copy';

function emptyBundle(): CopyBundle {
  return { ja: defaultsFor('ja'), en: defaultsFor('en'), th: defaultsFor('th') };
}

/**
 * Server-side read. Returns all three languages at once — the page needs them
 * anyway to hand the client dictionary over for switching.
 */
export async function loadCopy(): Promise<CopyBundle> {
  const bundle = emptyBundle();
  try {
    const { data, error } = await supabaseServer
      .from('site_copy')
      .select('key, lang, value');
    if (error || !data) return bundle;

    for (const row of data as { key: string; lang: string; value: string | null }[]) {
      // A row for a key the registry no longer defines is stale, not content.
      if (!isLang(row.lang) || !FIELD_BY_KEY.has(row.key)) continue;
      const value = (row.value ?? '').trim();
      // An emptied field means "give me the shipped default back", not "blank".
      if (!value) continue;
      // Rich values are sanitized on write; this is the read-side validator that
      // degrades tampered markup to escaped text instead of executing it.
      bundle[row.lang][row.key] = RICH_KEYS.has(row.key) ? richForServer(value) : value;
    }
  } catch {
    /* Network/DNS failure — the defaults already in `bundle` are the answer. */
  }
  return bundle;
}

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

  document.documentElement.lang = lang;
}
