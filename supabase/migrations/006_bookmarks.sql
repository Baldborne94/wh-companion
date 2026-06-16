-- WH40K Companion — Bookmarks
-- Stores EPUB (epub_cfi) and PDF (page_num) bookmarks per user per book.

create table if not exists bookmarks (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete cascade,
  book_id    text not null,
  epub_cfi   text,
  page_num   int,
  label      text,
  progress   int default 0,
  created_at timestamptz default now()
);

alter table bookmarks enable row level security;

create policy "Own bookmarks" on bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
