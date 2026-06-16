-- WH40K Companion — User Settings
-- Stores per-user preferences that should sync across devices.

create table if not exists user_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  universe   text,
  hh_mode    text default 'full',
  updated_at timestamptz default now()
);

alter table user_settings enable row level security;

create policy "Own user_settings" on user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
