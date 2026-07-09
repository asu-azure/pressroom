-- ============================================================
-- Pressroom cover-crop + spread controls — run in the Supabase SQL
-- editor on an existing database (idempotent). Fresh installs get
-- these columns from schema.sql already.
--
-- Adds:
--   works.cover_crop — {x,y,w,h} normalized 0..1 crop of the cover image
--                      for the library card (null = auto object-fit:cover).
--   works.cover_solo — whether the cover stands alone in double layout,
--                      which decides where two-page spreads begin.
--   pages.is_blank   — a blank spacer/placeholder leaf (no image) used to
--                      fill missing pages or shift spread parity.
--
-- RLS needs no changes: all three ride the existing works/pages policies.
-- ============================================================

alter table works add column if not exists cover_crop jsonb;
alter table works add column if not exists cover_solo boolean not null default true;
alter table pages add column if not exists is_blank  boolean not null default false;
