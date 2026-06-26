-- WH40K Companion — Highlights
-- Stores EPUB text highlights (epub_cfi + colour + excerpt) per user per book,
-- so highlights sync across devices like bookmarks do.

create table if not exists highlights (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete cascade,
  book_id    text not null,
  epub_cfi   text not null,
  text       text,
  color      text,
  created_at timestamptz default now()
);

alter table highlights enable row level security;

create policy "Own highlights" on highlights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
