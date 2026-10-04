-- The first release date of a book — the shelf stands in release order.
--
-- Idempotent like every other add-on here: safe to re-run. No new policies: the
-- column rides works_public_read / works_author_upd (schema.sql), and a locked
-- work exposes it like its title — it describes the book, not its pages.
--
--   released_on  date of the first release (初版), nullable. The shelf orders by it
--                (oldest first, books without one after, then as before — most
--                recently edited first), prints its year on the label, and the
--                timeline's 刊行順 uses the same order (lib/release.ts). Reprints
--                stay in release_label (book-info.sql) — free text, shown line by
--                line in the overview's 奥付.
--
-- library_cards() is untouched: the shelf reads works.* itself and sorts in the
-- browser, so the RPC's return type (which would need a drop to change) stays.

alter table works add column if not exists released_on date;
