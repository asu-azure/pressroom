-- ============================================================
-- Clean pages (idempotent — safe to re-run). Needs schema.sql.
--
-- The same page with no lettering, exported from the art files. Under a
-- typeset translation the reader draws it instead of the page, so no Thai
-- shows through and the cover patches aren't needed. Optional per page: a
-- page without one keeps its picture and its patches.
--
-- Uploaded by the Studio's IMPORT PREPARED FILES (src/lib/preparedImport.ts)
-- with the author's session; RLS on pages and storage decides as for any edit.
-- The check keeps a clean picture inside its own page's folder.
-- ============================================================

alter table public.pages add column if not exists clean_path text;
alter table public.pages add column if not exists clean_med_path text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pages_clean_in_folder') then
    alter table public.pages add constraint pages_clean_in_folder check (
      (clean_path is null or clean_path like 'works/' || work_id || '/' || id || '/%')
      and (clean_med_path is null or clean_med_path like 'works/' || work_id || '/' || id || '/%')
    );
  end if;
end $$;
