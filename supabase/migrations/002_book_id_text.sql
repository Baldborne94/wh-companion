-- Migration: change book_id from int to text
-- Required because AoS book IDs are strings like "aos1", "aos81", etc.
-- 40K numeric IDs continue to work as text ("1", "42", etc.)
-- Run this in Supabase SQL editor.

alter table ebook_files      alter column book_id type text using book_id::text;
alter table reading_progress alter column book_id type text using book_id::text;
