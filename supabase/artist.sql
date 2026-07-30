-- ============================================================
-- Artist page (/asu) — profile + gallery. Run AFTER schema.sql
-- and storage.sql (needs is_author() and touch_updated_at()).
-- Idempotent; safe to re-run. Applied to the live project as
-- migrations: artist_profile_and_artworks, art_bucket,
-- drop_dead_series.
-- ============================================================

create table if not exists artist_profile (
  id               smallint primary key default 1 check (id = 1),  -- enforced singleton
  display_name     text not null default 'Asu Azure',
  bio              text not null default '',   -- rich HTML, sanitized on render like works.foreword
  portrait_path    text,                       -- storage path in the 'art' bucket
  craft            text[] not null default '{}',
  links            jsonb not null default '{}'::jsonb,  -- {x, x_handle, email}
  commissions_open boolean not null default false,
  updated_at       timestamptz not null default now()
);

create table if not exists artworks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default '',
  medium     text not null default '',  -- drives the filter chips on /asu
  alt        text not null default '',
  sort_key   text not null,             -- fractional-indexing key; reorder = 1 UPDATE
  featured   boolean not null default false,
  published  boolean not null default true,
  width      int not null,
  height     int not null,
  image_path text not null,             -- storage paths in the 'art' bucket
  med_path   text not null,
  thumb_path text not null,
  created_at timestamptz not null default now(),
  -- deferrable like pages: bulk reorders upsert through colliding intermediate states
  constraint artworks_sort_key_key unique (sort_key) deferrable initially deferred
);
create index if not exists artworks_order on artworks (sort_key);

alter table artist_profile enable row level security;
alter table artworks enable row level security;

drop policy if exists artist_profile_public_read on artist_profile;
create policy artist_profile_public_read on artist_profile for select using (true);
drop policy if exists artist_profile_author_ins on artist_profile;
create policy artist_profile_author_ins on artist_profile for insert with check (is_author());
drop policy if exists artist_profile_author_upd on artist_profile;
create policy artist_profile_author_upd on artist_profile for update using (is_author());

drop policy if exists artworks_public_read on artworks;
create policy artworks_public_read on artworks for select using (published or is_author());
drop policy if exists artworks_author_ins on artworks;
create policy artworks_author_ins on artworks for insert with check (is_author());
drop policy if exists artworks_author_upd on artworks;
create policy artworks_author_upd on artworks for update using (is_author());
drop policy if exists artworks_author_del on artworks;
create policy artworks_author_del on artworks for delete using (is_author());

drop trigger if exists artist_profile_touch on artist_profile;
create trigger artist_profile_touch before update on artist_profile
  for each row execute function touch_updated_at();

-- The singleton row exists from day one so the app can always update id=1.
insert into artist_profile (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Public 'art' bucket — policies copied from the 'pages' bucket
-- pattern: public URL access needs no SELECT policy (adding one
-- would let anyone LIST drafts); the author needs SELECT because
-- upload upserts read the conflicting row.
-- Paths: gallery/{artwork_id}/full|med|thumb.webp · profile/portrait.webp
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('art', 'art', true)
on conflict (id) do nothing;

drop policy if exists art_storage_read_author on storage.objects;
create policy art_storage_read_author on storage.objects for select
  to authenticated
  using (bucket_id = 'art' and is_author());
drop policy if exists art_storage_ins on storage.objects;
create policy art_storage_ins on storage.objects for insert
  with check (bucket_id = 'art' and is_author());
drop policy if exists art_storage_upd on storage.objects;
create policy art_storage_upd on storage.objects for update
  using (bucket_id = 'art' and is_author());
drop policy if exists art_storage_del on storage.objects;
create policy art_storage_del on storage.objects for delete
  using (bucket_id = 'art' and is_author());

-- ------------------------------------------------------------
-- Cleanup: series shipped in the original schema but nothing
-- ever read or wrote it.
-- ------------------------------------------------------------
alter table works drop column if exists series_id;
drop table if exists series;
