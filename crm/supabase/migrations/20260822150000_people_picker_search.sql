-- ===========================================================================
-- People pickers: index the name search they now run
--
-- Owner / designer / execution pickers used to render every active member of
-- the role into the page and filter that list in the browser. They now send
-- what was typed to `searchOwnersAction` (and friends), which is a
-- `full_name ilike '%…%'` against profiles.
--
-- A leading wildcard cannot use a btree index, so without this the search is a
-- sequential scan of profiles on every debounced keystroke — invisible at a
-- team of ten, a scan per keystroke at a team of ten thousand. pg_trgm's GIN
-- index serves ILIKE directly (the same treatment `20260812143000` gave the
-- lead search columns).
--
-- Note trigram indexes need three characters to match on; shorter queries fall
-- back to a scan, which is why the picker's own search waits for a real word
-- before asking.
-- ===========================================================================

create extension if not exists pg_trgm with schema extensions;

create index if not exists profiles_full_name_trgm_idx
  on public.profiles using gin (full_name extensions.gin_trgm_ops);
