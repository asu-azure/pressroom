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
import { isLang } from './lang';
import { COPY_FIELDS, FIELD_BY_KEY, defaultsFor } from '../data/copyKeys';
import { richForServer } from './richtext';
import type { CopyBundle } from './siteCopyClient';

// The browser half lives in siteCopyClient.ts so page scripts can import it
// without dragging supabase-js and the whole copy registry into their bundle.
export { COPY_PAYLOAD_ID, readCopyPayload, applyCopy, type CopyBundle } from './siteCopyClient';

/** Keys whose value is HTML rather than a plain line. */
const RICH_KEYS = new Set(COPY_FIELDS.filter((f) => f.type === 'rich').map((f) => f.key));

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
