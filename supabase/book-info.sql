-- Book info, content notes and series — the overview's 奥付.
--
-- Idempotent like every other add-on here: safe to re-run.
--
-- Every column is optional: a work with none of them renders the overview as it
-- always has. No new policies: these ride works_public_read / works_author_upd
-- (schema.sql), and a locked work exposes them like its title and description —
-- they describe the book, not its pages.
--
--   book_lang         language the book is written in ('th', 'ja', 'en', …)
--   translations      languages a translation exists in ('{ja}' once the bubbles are in)
--   formats           what the book holds, in order: manga / novel / illust
--   release_label     free text, e.g. '2026年3月 Comic Square 9'
--   content_warnings  one note per item, shown above the read button
--   series_*          same series_title = same series; order sorts it (1, 2, 1.5 …),
--                     kind is 本編 (main) or 外伝 (side), label is the arc name
--
-- Never name a column series_id: artist.sql drops a column of that name (the
-- retired series table) and is meant to be safe to re-run.

alter table works add column if not exists book_lang        text;
alter table works add column if not exists translations     text[] not null default '{}';
alter table works add column if not exists formats          text[] not null default '{}';
alter table works add column if not exists release_label    text;
alter table works add column if not exists content_warnings text[] not null default '{}';
alter table works add column if not exists series_title     text;
alter table works add column if not exists series_order     numeric;
alter table works add column if not exists series_kind      text;
alter table works add column if not exists series_label     text;

alter table works drop constraint if exists works_series_kind_chk;
alter table works add  constraint works_series_kind_chk
  check (series_kind is null or series_kind in ('main', 'side'));

alter table works drop constraint if exists works_formats_chk;
alter table works add  constraint works_formats_chk
  check (formats <@ array['manga', 'novel', 'illust']::text[]);

create index if not exists works_series_title_idx on works (series_title) where series_title is not null;
