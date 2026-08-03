-- ============================================================
-- Page copy for /asu and the homepage artist teaser. Run AFTER
-- schema.sql and storage.sql (needs is_author() and
-- touch_updated_at()). Idempotent; safe to re-run.
--
-- Only OVERRIDES live here. Every key ships a default for all
-- three languages in src/data/copyKeys.ts, so a missing row is
-- normal and the page still renders in full. That is why there
-- is no seed insert below and no NOT NULL beyond `value`.
-- ============================================================

create table if not exists site_copy (
  key        text not null,
  lang       text not null check (lang in ('en', 'th', 'ja')),
  value      text not null default '',
  updated_at timestamptz not null default now(),
  primary key (key, lang)
);

-- The page reads every row for all three languages in one shot.
create index if not exists site_copy_lang on site_copy (lang);

alter table site_copy enable row level security;

-- Public read: this is the visible copy of a public page.
drop policy if exists site_copy_public_read on site_copy;
create policy site_copy_public_read on site_copy for select using (true);

drop policy if exists site_copy_author_ins on site_copy;
create policy site_copy_author_ins on site_copy for insert with check (is_author());
drop policy if exists site_copy_author_upd on site_copy;
create policy site_copy_author_upd on site_copy for update using (is_author());
-- Deleting a row is how the author reverts a field to its shipped default.
drop policy if exists site_copy_author_del on site_copy;
create policy site_copy_author_del on site_copy for delete using (is_author());

drop trigger if exists site_copy_touch on site_copy;
create trigger site_copy_touch before update on site_copy
  for each row execute function touch_updated_at();
