-- ============================================================
-- Pressroom schema — run in the Supabase SQL editor.
--
-- BEFORE RUNNING:
--   1. Create the author user in Auth (email + password).
--   2. Replace AUTHOR_UID below with that user's auth.users.id.
--   3. Disable public signups: Auth → Providers → Email → turn off signups
--      (mandatory — RLS pins writes to the author, but no other accounts
--      should exist at all).
-- ============================================================

create table series (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  slug       text not null unique,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

create table works (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  title          text not null,
  description    text not null default '',
  series_id      uuid references series(id) on delete set null,
  status         text not null default 'oneshot'
                   check (status in ('ongoing','complete','oneshot')),
  direction      text not null default 'rtl'    check (direction in ('rtl','ltr')),
  default_layout text not null default 'double' check (default_layout in ('single','double')),
  default_mode   text not null default 'flip'   check (default_mode in ('scroll','flip')),
  tags           text[] not null default '{}',
  cover_page_id  uuid,  -- FK added after pages exists (circular reference)
  published      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table pages (
  id             uuid primary key default gen_random_uuid(),
  work_id        uuid not null references works(id) on delete cascade,
  sort_key       text not null,   -- fractional-indexing key; reorder = 1 UPDATE
  spread_pair_id uuid,            -- same uuid on BOTH pages of a forced spread
  width          int  not null,   -- intrinsic px of the full variant
  height         int  not null,
  image_path     text not null,   -- storage paths in the 'pages' bucket
  med_path       text not null,
  thumb_path     text not null,
  note           text,            -- author margin note, readers see it
  created_at     timestamptz not null default now(),
  unique (work_id, sort_key)
);
create index pages_work_order on pages (work_id, sort_key);

alter table works
  add constraint works_cover_fk
  foreign key (cover_page_id) references pages(id) on delete set null;

-- ============================================================
-- RLS — the security boundary (the app ships only the anon key)
-- ============================================================
alter table series enable row level security;
alter table works  enable row level security;
alter table pages  enable row level security;

-- Author pin: defense in depth on top of disabled signups.
create or replace function is_author() returns boolean
language sql stable as
$$ select auth.uid() = 'AUTHOR_UID'::uuid $$;

-- Public read of published content; the author reads everything.
create policy works_public_read on works for select
  using (published or is_author());
create policy pages_public_read on pages for select
  using (is_author() or exists (
    select 1 from works w where w.id = pages.work_id and w.published));
create policy series_public_read on series for select using (true);

-- Author-only writes.
create policy works_author_ins on works for insert with check (is_author());
create policy works_author_upd on works for update using (is_author());
create policy works_author_del on works for delete using (is_author());

create policy pages_author_ins on pages for insert with check (is_author());
create policy pages_author_upd on pages for update using (is_author());
create policy pages_author_del on pages for delete using (is_author());

create policy series_author_ins on series for insert with check (is_author());
create policy series_author_upd on series for update using (is_author());
create policy series_author_del on series for delete using (is_author());

-- Keep works.updated_at honest.
create or replace function touch_updated_at() returns trigger
language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;

create trigger works_touch before update on works
  for each row execute function touch_updated_at();
