-- A work's prose (a novel part) as text, per language — read in the novel
-- reader (/w/[slug]/novel) instead of as page images.
--
-- Idempotent like every other add-on here: safe to re-run. Needs read-lock.sql
-- (work_secrets, is_author()) first.
--
-- Model:
--   novel_sections  one row per section (a chapter or scene) per language;
--                   body is a list of blocks: {t:'p', text, align?, bold?},
--                   {t:'img', path, w, h, alt?} (a path in the pages bucket),
--                   {t:'gap'} (a blank line the author left on purpose).
--   works.novel_langs  public: which languages have text, so the overview can
--                   offer 「小説を読む」 even while the text itself is locked.
--   unlock_novel(work, password, lang)  the read-lock for text: a locked work's
--                   sections reach anon only through this, password checked
--                   in Postgres exactly like unlock_pages.

alter table works add column if not exists novel_langs text[] not null default '{}';

create table if not exists novel_sections (
  id         uuid primary key default gen_random_uuid(),
  work_id    uuid not null references works(id) on delete cascade,
  lang       text not null check (lang in ('th', 'ja', 'en')),
  sort_key   text not null collate "C",
  title      text not null default '',
  body       jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (work_id, lang, sort_key)
);
create index if not exists novel_sections_work_lang_idx on novel_sections (work_id, lang, sort_key);

alter table novel_sections enable row level security;

drop policy if exists novel_public_read on novel_sections;
create policy novel_public_read on novel_sections for select
  using (is_author() or exists (
    select 1 from works w where w.id = novel_sections.work_id and w.published and not w.read_locked));

drop policy if exists novel_author_ins on novel_sections;
create policy novel_author_ins on novel_sections for insert with check (is_author());
drop policy if exists novel_author_upd on novel_sections;
create policy novel_author_upd on novel_sections for update using (is_author());
drop policy if exists novel_author_del on novel_sections;
create policy novel_author_del on novel_sections for delete using (is_author());

-- Wrong password → empty set; the client reads empty as "wrong" (a work only
-- lists a language in novel_langs once it has text in it).
create or replace function unlock_novel(p_work_id uuid, p_password text, p_lang text)
returns setof public.novel_sections
language sql stable security definer
set search_path = ''
as $$
  select n.*
  from public.novel_sections n
  join public.works w on w.id = n.work_id
  join public.work_secrets s on s.work_id = n.work_id
  where n.work_id = p_work_id
    and n.lang = p_lang
    and w.published
    and s.password_hash = extensions.crypt(p_password, s.password_hash)
  order by n.sort_key;
$$;
revoke all on function unlock_novel(uuid, text, text) from public;
grant execute on function unlock_novel(uuid, text, text) to anon, authenticated;
