-- Per-work reading password ("read lock").
-- Run once in the SQL editor (or applied as a migration). Fresh installs can
-- run this after schema.sql. Idempotent like translations.sql.
--
-- Model (RLS stays the security boundary — no server, anon key only):
--   works.read_locked   — public flag; gates the pages policy below.
--   works.password_hint — public by design (rides works_public_read).
--   work_secrets        — bf-crypt password hash; NO anon policy at all,
--                         the hash never reaches a client.
--   unlock_pages(work, password)      — anon RPC; returns the pages only if
--                                       the password matches (empty = wrong).
--   set_read_password / clear_read_password — author-only management RPCs,
--                                       so the password is changeable any time.
--
-- Caveats: image bytes in the public bucket stay fetchable by exact URL
-- (paths are unguessable UUIDs — discovery needs these rows); the cover page
-- row stays public so library cards and the overview hero keep rendering.

create extension if not exists pgcrypto;

alter table works add column if not exists read_locked   boolean not null default false;
alter table works add column if not exists password_hint text;

create table if not exists work_secrets (
  work_id       uuid primary key references works(id) on delete cascade,
  password_hash text not null
);
alter table work_secrets enable row level security;

drop policy if exists secrets_author_all on work_secrets;
create policy secrets_author_all on work_secrets
  for all using (is_author()) with check (is_author());

-- Locked works expose only their cover row to anon; the author sees all.
drop policy if exists pages_public_read on pages;
create policy pages_public_read on pages for select
  using (is_author() or exists (
    select 1 from works w where w.id = pages.work_id and w.published
      and (not w.read_locked or w.cover_page_id = pages.id)));

-- Password check happens HERE, in Postgres — crypt() against the stored bf
-- hash. Wrong password → empty set (a locked published work always has pages,
-- so the client reads empty as "wrong"). search_path is pinned, so pgcrypto
-- must be schema-qualified (Supabase installs it into `extensions`).
create or replace function unlock_pages(p_work_id uuid, p_password text)
returns setof public.pages
language sql stable security definer
set search_path = ''
as $$
  select p.*
  from public.pages p
  join public.works w on w.id = p.work_id
  join public.work_secrets s on s.work_id = p.work_id
  where p.work_id = p_work_id
    and w.published
    and s.password_hash = extensions.crypt(p_password, s.password_hash)
  order by p.sort_key;
$$;
revoke all on function unlock_pages(uuid, text) from public;
grant execute on function unlock_pages(uuid, text) to anon, authenticated;

create or replace function set_read_password(p_work_id uuid, p_password text, p_hint text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_author() then
    raise exception 'forbidden';
  end if;
  if coalesce(trim(p_password), '') = '' then
    raise exception 'empty password';
  end if;
  insert into public.work_secrets (work_id, password_hash)
  values (p_work_id, extensions.crypt(p_password, extensions.gen_salt('bf', 8)))
  on conflict (work_id) do update set password_hash = excluded.password_hash;
  update public.works
     set read_locked = true,
         password_hint = nullif(trim(p_hint), '')
   where id = p_work_id;
end;
$$;
revoke all on function set_read_password(uuid, text, text) from public;
revoke execute on function set_read_password(uuid, text, text) from anon;
grant execute on function set_read_password(uuid, text, text) to authenticated;

create or replace function clear_read_password(p_work_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_author() then
    raise exception 'forbidden';
  end if;
  delete from public.work_secrets where work_id = p_work_id;
  update public.works
     set read_locked = false,
         password_hint = null
   where id = p_work_id;
end;
$$;
revoke all on function clear_read_password(uuid) from public;
revoke execute on function clear_read_password(uuid) from anon;
grant execute on function clear_read_password(uuid) to authenticated;
