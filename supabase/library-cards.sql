-- Library card data — one row per published work, for the homepage grid.
-- Run once in the SQL editor (after schema.sql / cover-and-blanks.sql /
-- read-lock.sql). Idempotent, like the other add-on files here.
--
-- Already applied to the live project as migration `library_cards`.
--
-- The linter flags this as `anon_security_definer_function_executable` (0028),
-- same as unlock_pages. Accepted: it takes no arguments, is scoped to published
-- works, and the only thing it exposes beyond the existing public cover row is
-- a locked book's page count — which is what the card prints as "84P".
--
-- Why this exists: the homepage used to select every page row of every
-- published work and pick the cover + count client-side. PostgREST caps a
-- response at 1000 rows, so past ~1000 total pages the later works silently
-- lost their covers and reported wrong counts — and every visitor downloaded
-- a row per page to render a grid of thumbnails.
--
-- security definer on purpose: a read-locked work exposes only its cover row
-- to anon (see read-lock.sql), so an RLS-respecting count would report "1P"
-- for every locked book. The page COUNT is not the secret — the pages are.
-- Scoped to works.published, so drafts still never leak.

create or replace function library_cards()
returns table (
  card_work_id       uuid,
  card_cover_page_id uuid,
  card_med_path      text,
  card_page_count    int
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    w.id,
    cover.id,
    cover.med_path,
    coalesce(tally.n, 0)::int
  from public.works w
  -- Blank leaves are spacers, not content — they never count as pages.
  left join lateral (
    select count(*)::int as n
    from public.pages p
    where p.work_id = w.id
      and not p.is_blank
  ) tally on true
  -- Same cover resolution the client used to do: the author's explicit choice
  -- wins (even if it is a blank), else the first non-blank page in reading order.
  left join lateral (
    select p.id, p.med_path
    from public.pages p
    where p.work_id = w.id
      and (p.id is not distinct from w.cover_page_id or not p.is_blank)
    order by (p.id is not distinct from w.cover_page_id) desc, p.sort_key
    limit 1
  ) cover on true
  where w.published;
$$;

revoke all on function library_cards() from public;
grant execute on function library_cards() to anon, authenticated;
