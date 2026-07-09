-- ============================================================
-- Pressroom storage — run AFTER schema.sql (needs is_author()).
--
-- Buckets:
--   pages     — public-read, author-write. Page image variants live at
--               works/{work_id}/{page_id}/full.webp|med.webp|thumb.webp
--               (or .jpg when uploaded from Safari). Paths are immutable;
--               the app uploads with cacheControl: 31536000.
--   originals — PRIVATE, author-only. Optional source PDFs at
--               works/{work_id}/original.pdf
-- ============================================================

insert into storage.buckets (id, name, public)
values ('pages', 'pages', true), ('originals', 'originals', false)
on conflict (id) do nothing;

-- NOTE: no SELECT policy on the public bucket — public URL access doesn't
-- need one, and adding one would let clients LIST every file (including
-- draft pages). Supabase linter 0025.

create policy pages_storage_ins on storage.objects for insert
  with check (bucket_id = 'pages' and is_author());
create policy pages_storage_upd on storage.objects for update
  using (bucket_id = 'pages' and is_author());
create policy pages_storage_del on storage.objects for delete
  using (bucket_id = 'pages' and is_author());

create policy originals_storage_all_read on storage.objects for select
  using (bucket_id = 'originals' and is_author());
create policy originals_storage_ins on storage.objects for insert
  with check (bucket_id = 'originals' and is_author());
create policy originals_storage_del on storage.objects for delete
  using (bucket_id = 'originals' and is_author());
