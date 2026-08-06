-- Scene slots + commission visibility.
--
-- Idempotent like every other add-on here: safe to re-run.
--
-- `scenes` stores ONLY overrides, exactly like site_copy does for words. The
-- slot registry lives in src/data/sceneSlots.ts and the fallbacks live in
-- src/lib/scenes.ts, so an empty '{}' renders the page as it has always looked.
-- Shape: { "<slot key>": { "mode": "photo|plate|backdrop|off", "art": ["<artwork id>", …] } }
--
-- `commissions_show` is separate from `commissions_open`: open/closed picks
-- WHICH line to show, this picks whether to mention commissions at all.
--
-- No new policies: artist_profile's RLS is row-level (artist.sql), so
-- artist_profile_author_upd already covers both columns.

alter table artist_profile
  add column if not exists scenes jsonb not null default '{}'::jsonb;

alter table artist_profile
  add column if not exists commissions_show boolean not null default true;
