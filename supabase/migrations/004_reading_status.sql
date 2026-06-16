-- WH40K Companion — Reading Status
-- Stores want/reading/read status for all books (WH40K and AoS) per user.
-- book_id is text to support both numeric 40K IDs and 'aos_...' AoS IDs.

create table if not exists reading_status (
  user_id      uuid references auth.users(id) on delete cascade,
  book_id      text not null,
  status       text not null default 'none'
                 check (status in ('none','want','reading','read')),
  updated_at   timestamptz default now(),
  started_at   timestamptz,
  completed_at timestamptz,
  primary key (user_id, book_id)
);

alter table reading_status enable row level security;

create policy "Own reading_status" on reading_status
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
