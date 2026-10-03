<script lang="ts">
  /**
   * IMPORT PREPARED FILES — a folder made off-site (clean page exports, the
   * novel's illustrations) with a manifest.json saying where each file goes.
   * Uploads with the author's own session (RLS is the boundary, as for every
   * Studio write), then writes the clean paths onto the page rows. The
   * manifest is checked first (lib/preparedImport.ts); nothing is sent if any
   * entry is wrong or any listed file is missing from the folder.
   */
  import { supabase } from '../../lib/supabase';
  import { PAGES_BUCKET } from '../../lib/storagePaths';
  import { parseManifest, indexFolder, contentTypeOf, type PreparedPlan } from '../../lib/preparedImport';

  let { workId, pageIds, onDone }: { workId: string; pageIds: string[]; onDone: () => void } = $props();

  const CACHE_CONTROL = '31536000';
  let plan = $state<PreparedPlan | null>(null);
  let problems = $state<string[]>([]);
  let folderName = $state('');
  let busy = $state(false);
  let sent = $state(0);
  let report = $state('');
  let files: File[] = [];
  let byRel = new Map<string, number>();

  async function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    files = [...(input.files ?? [])];
    input.value = '';
    plan = null;
    problems = [];
    report = '';
    folderName = files[0]?.webkitRelativePath.split('/')[0] ?? '';
    const idx = indexFolder(files);
    byRel = idx.byRel;
    if (idx.manifest < 0) {
      problems = ['no manifest.json at the top of that folder'];
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await files[idx.manifest].text());
    } catch {
      problems = ['manifest.json is not valid JSON'];
      return;
    }
    const p = parseManifest(raw, workId, pageIds);
    const missing = p.entries.filter((en) => !byRel.has(en.file)).map((en) => `missing from the folder: ${en.file}`);
    problems = [...p.errors, ...missing];
    plan = p;
  }

  async function run() {
    if (!plan || problems.length || busy) return;
    busy = true;
    sent = 0;
    const failed: string[] = [];
    const queue = [...plan.entries];
    const worker = async () => {
      for (let en = queue.shift(); en; en = queue.shift()) {
        const file = files[byRel.get(en.file)!];
        const { error } = await supabase.storage
          .from(PAGES_BUCKET)
          .upload(en.path, file, { cacheControl: CACHE_CONTROL, contentType: contentTypeOf(en.path), upsert: true });
        if (error) failed.push(`${en.file}: ${error.message}`);
        sent += 1;
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    // a page's columns are written only when all of its files went up
    let rows = 0;
    for (const [page, cols] of plan.updates) {
      if (failed.some((f) => f.startsWith(`${page}/`))) continue;
      const { error } = await supabase.from('pages').update(cols).eq('id', page).eq('work_id', workId);
      if (error) failed.push(`page ${page}: ${error.message}`);
      else rows += 1;
    }
    busy = false;
    problems = failed;
    report = `${plan.entries.length - failed.filter((f) => !f.startsWith('page ')).length} FILES UPLOADED · ${rows} PAGES UPDATED${failed.length ? ` · ${failed.length} FAILED` : ''}`;
    if (rows || !failed.length) onDone();
  }
</script>

<section class="pi">
  <div class="pi__row">
    <label class="mono pi__file">
      <!-- webkitdirectory: the whole prepared folder, manifest included -->
      <input type="file" webkitdirectory multiple onchange={pick} disabled={busy} />
      {folderName ? `FOLDER: ${folderName}` : 'IMPORT PREPARED FILES — PICK A FOLDER WITH manifest.json'}
    </label>
    {#if plan && !problems.length && !report}
      <button type="button" class="mono pi__go" onclick={run} disabled={busy}>
        {busy ? `UPLOADING ${sent} / ${plan.entries.length}` : `UPLOAD ${plan.entries.length} FILES · ${plan.updates.size} PAGES`}
      </button>
    {/if}
  </div>
  {#if report}
    <p class="mono pi__ok">{report}</p>
  {/if}
  {#if problems.length}
    <ul class="mono pi__problems">
      {#each problems.slice(0, 12) as p (p)}<li>{p}</li>{/each}
      {#if problems.length > 12}<li>… {problems.length - 12} MORE</li>{/if}
    </ul>
  {/if}
</section>

<style>
  .pi {
    display: grid;
    gap: 0.6rem;
    padding: 0.8rem 1.2rem;
    border: 1px dashed var(--line-strong);
    font-size: 0.7rem;
    letter-spacing: 0.06em;
  }
  .pi__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
  }
  .pi__file {
    flex: 1;
    min-width: 12rem;
    border: 1px solid var(--line-strong);
    padding: 0.7em 1em;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pi__file input {
    display: none;
  }
  .pi__file:hover {
    border-color: var(--fg-dim);
    color: var(--fg);
  }
  .pi__go {
    background: var(--accent);
    color: var(--ink-fg);
    border: 0;
    padding: 0.8em 1.3em;
    cursor: pointer;
    font: inherit;
    letter-spacing: inherit;
  }
  .pi__go:disabled {
    opacity: 0.6;
    cursor: progress;
  }
  .pi__ok {
    margin: 0;
    color: var(--accent);
  }
  .pi__problems {
    margin: 0;
    padding-left: 1.2em;
    color: #d6455f;
  }
</style>
