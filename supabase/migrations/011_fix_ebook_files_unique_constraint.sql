-- WH40K Companion — Fix ebook_files unique constraint
--
-- 001_initial_schema.sql declares `unique(user_id, book_id)` (per-user files),
-- and the app upserts against exactly that composite key (BookDetail.jsx,
-- AoSApp.jsx: `.upsert(meta, { onConflict: "user_id,book_id" })`). But some
-- live databases ended up with an EXTRA, wrong constraint on `book_id` alone —
-- Postgres auto-names an unnamed single-column unique constraint
-- "<table>_<column>_key", which is exactly the "ebook_files_book_id_key" seen
-- in the "duplicate key value violates unique constraint" error users hit when
-- uploading an EPUB/PDF. A book_id-only constraint means only ONE user in the
-- entire database can ever have a file for a given book — any second user (or
-- a retry that re-inserts after the upsert's ON CONFLICT target doesn't match
-- and falls back to delete+insert) collides.
--
-- Run this in the Supabase SQL editor if you're hitting that error.

-- Drop the wrong single-column constraint if present.
alter table ebook_files drop constraint if exists ebook_files_book_id_key;

-- Ensure the correct composite constraint exists (idempotent — skips if a
-- unique constraint covering exactly these two columns, under any name and
-- regardless of declaration order, already exists rather than erroring).
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'ebook_files'
      and c.contype = 'u'
      and (
        select array_agg(a.attname::text order by a.attname::text)
        from unnest(c.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
      ) = array['book_id', 'user_id']
  ) then
    alter table ebook_files add constraint ebook_files_user_id_book_id_key unique (user_id, book_id);
  end if;
end $$;
