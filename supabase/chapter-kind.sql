-- What a chapter is, for a book made of parts: vol. 2 is a novel part and a
-- manga part in one book, and readers took them for two unrelated things.
--
-- Idempotent like every other add-on here: safe to re-run. No new policies: the
-- column rides chapters_public_read / chapters_author_* (schema.sql), and a
-- locked work's chapters were already public — they describe the book, not its
-- pages.
--
--   kind  'novel' | 'manga' | null (a plain chapter). The overview lists the
--         parts of a book with 2+ chapters (この本の構成), the page reader offers
--         「小説はテキストで読めます」 only on pages of a novel part, and the novel
--         reader's last page leads on to the manga part (lib/bookParts.ts).

alter table chapters add column if not exists kind text
  check (kind in ('manga', 'novel'));
