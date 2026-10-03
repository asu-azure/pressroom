/**
 * Files prepared off-site for a work — the clean (no-lettering) page images,
 * the novel's illustrations — arrive as a folder with a manifest.json:
 *
 *   { "work": "<work id>", "files": [
 *       { "file": "<page id>/clean-full.webp", "path": "works/<work>/<page>/clean-full.webp",
 *         "page": "<page id>", "column": "clean_path" },
 *       { "file": "novel/img01.webp", "path": "works/<work>/novel/img01.webp" } ] }
 *
 * The Studio uploads each file with the author's session (RLS decides) and,
 * when an entry names a page and a column, writes the path onto that page row.
 * The manifest comes from a script, not from the author's hand, so it is
 * checked as untrusted input: every path stays inside this work's folder, a
 * page entry inside that page's folder, and nothing escapes with `..`.
 */

export type CleanColumn = 'clean_path' | 'clean_med_path';
export const CLEAN_COLUMNS: readonly CleanColumn[] = ['clean_path', 'clean_med_path'];

export interface PreparedEntry {
  /** where the file sits in the picked folder, relative to the manifest */
  file: string;
  /** destination in the pages bucket */
  path: string;
  page?: string;
  column?: CleanColumn;
}

export interface PreparedPlan {
  entries: PreparedEntry[];
  /** page id → the columns to write once its files are up */
  updates: Map<string, Partial<Record<CleanColumn, string>>>;
  errors: string[];
}

const MAX_ENTRIES = 2000;
const SAFE = /^[A-Za-z0-9_\-./]+$/;
const IMAGE = /\.(webp|jpe?g|png)$/i;

function safeRel(p: unknown): p is string {
  return (
    typeof p === 'string' &&
    p.length > 0 &&
    p.length < 300 &&
    SAFE.test(p) &&
    !p.startsWith('/') &&
    !p.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')
  );
}

export function contentTypeOf(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/webp';
}

export function parseManifest(raw: unknown, workId: string, pageIds: Iterable<string>): PreparedPlan {
  const errors: string[] = [];
  const entries: PreparedEntry[] = [];
  const updates = new Map<string, Partial<Record<CleanColumn, string>>>();
  const pages = new Set(pageIds);
  const m = raw as { work?: unknown; files?: unknown } | null;

  if (!m || typeof m !== 'object') return { entries, updates, errors: ['manifest is not an object'] };
  if (m.work !== workId) errors.push(`manifest is for work ${String(m.work)}, not this one`);
  if (!Array.isArray(m.files) || !m.files.length) errors.push('manifest lists no files');
  else if (m.files.length > MAX_ENTRIES) errors.push(`manifest lists ${m.files.length} files (max ${MAX_ENTRIES})`);
  if (errors.length) return { entries, updates, errors };

  const root = `works/${workId}/`;
  const seen = new Set<string>();
  (m.files as unknown[]).forEach((f, i) => {
    const e = f as Record<string, unknown>;
    const where = `#${i + 1}`;
    if (!e || typeof e !== 'object') return void errors.push(`${where}: not an object`);
    const { file, path, page, column } = e;
    if (!safeRel(file)) return void errors.push(`${where}: bad file name`);
    if (!safeRel(path) || !path.startsWith(root)) return void errors.push(`${where}: path must stay inside ${root}`);
    if (!IMAGE.test(path)) return void errors.push(`${where}: ${path} is not an image path`);
    if (seen.has(path)) return void errors.push(`${where}: ${path} listed twice`);
    seen.add(path);
    const entry: PreparedEntry = { file, path };
    if (page !== undefined || column !== undefined) {
      if (typeof page !== 'string' || !pages.has(page)) return void errors.push(`${where}: page ${String(page)} is not in this work`);
      if (!CLEAN_COLUMNS.includes(column as CleanColumn)) return void errors.push(`${where}: unknown column ${String(column)}`);
      if (!path.startsWith(`${root}${page}/`)) return void errors.push(`${where}: a page's file must sit in that page's folder`);
      entry.page = page;
      entry.column = column as CleanColumn;
      const u = updates.get(page) ?? {};
      if (u[entry.column]) return void errors.push(`${where}: page ${page} gets ${entry.column} twice`);
      u[entry.column] = path;
      updates.set(page, u);
    }
    entries.push(entry);
  });
  return { entries, updates, errors };
}

/**
 * The picked folder's files by their path relative to the folder holding the
 * manifest (webkitRelativePath starts with the picked folder's own name).
 */
export function indexFolder(files: { name: string; webkitRelativePath: string }[]): {
  manifest: number;
  byRel: Map<string, number>;
} {
  const byRel = new Map<string, number>();
  let manifest = -1;
  files.forEach((f, i) => {
    const parts = (f.webkitRelativePath || f.name).split('/');
    const rel = parts.length > 1 ? parts.slice(1).join('/') : parts[0];
    if (rel === 'manifest.json') manifest = i;
    else byRel.set(rel, i);
  });
  return { manifest, byRel };
}
