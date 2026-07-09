-- ============================================================
-- Pressroom translations — run in the Supabase SQL editor on an
-- existing database (idempotent). Fresh installs get these two
-- columns from schema.sql already.
--
-- Adds:
--   works.characters — the reusable cast (name + accent colour) a work's
--                       speech bubbles are attributed to.
--   pages.bubbles    — per-page translated speech bubbles: normalized
--                       0..1 rectangles + panel grouping + character + text.
--
-- RLS needs no changes: both columns ride the existing works/pages
-- policies (author-write; public-read follows the published work).
-- ============================================================

alter table works add column if not exists characters jsonb not null default '[]'::jsonb;
alter table pages add column if not exists bubbles    jsonb not null default '[]'::jsonb;
