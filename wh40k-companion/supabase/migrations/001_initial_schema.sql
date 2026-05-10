-- WH40K Companion — Initial Schema
-- Run this in Supabase SQL editor to set up the database from scratch.

-- ─── EXTENSIONS ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── TABLES ───────────────────────────────────────────────────────────────────

-- Tracks which EPUB/PDF file a user has uploaded for each book
create table if not exists ebook_files (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete cascade,
  book_id    int  not null,
  file_name  text not null,
  file_path  text not null,
  file_type  text not null check (file_type in ('epub','pdf')),
  created_at timestamptz default now(),
  unique(user_id, book_id)
);

-- Tracks reading progress per user per book
create table if not exists reading_progress (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid references auth.users(id) on delete cascade,
  book_id        int  not null,
  chapter_index  int  not null default 0,
  page_index     int  not null default 0,   -- page within chapter (paginated mode)
  progress_pct   float not null default 0,  -- 0-1 overall percentage
  last_read      timestamptz default now(),
  unique(user_id, book_id)
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

alter table ebook_files      enable row level security;
alter table reading_progress enable row level security;

-- Users can only see/modify their own rows
create policy "Own ebook_files" on ebook_files
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Own reading_progress" on reading_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── STORAGE BUCKET ───────────────────────────────────────────────────────────
-- Create via Supabase dashboard: Storage → New bucket → "ebooks" → private
-- Then add this policy in Storage → ebooks → Policies:
--
--   Policy name: "Users manage own files"
--   Allowed operation: ALL
--   Target roles: authenticated
--   USING expression: (storage.foldername(name))[1] = auth.uid()::text
