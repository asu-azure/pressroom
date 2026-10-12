-- Credits — the people besides the author, shown in the overview's 奥付 row.
--
-- Idempotent like every other add-on here: safe to re-run. Optional: a work with
-- none renders the overview as it always has. No new policies: the column rides
-- works_public_read / works_author_upd (schema.sql); like the title, a credit
-- describes the book, so a locked work shows it too.
--
--   credits  [{"ja": "日本語校正", "en": "Japanese proofreading", "name": "なぎ"}, …]
--            ja / en = the role in each chrome (en is shown in capitals), name as
--            the person wants it written. Order is the order shown.

alter table works add column if not exists credits jsonb not null default '[]'::jsonb;

alter table works drop constraint if exists works_credits_chk;
alter table works add  constraint works_credits_chk check (jsonb_typeof(credits) = 'array');
