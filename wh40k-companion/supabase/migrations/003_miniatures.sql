-- Migration: miniatures painting tracker tables
-- Run in Supabase SQL Editor.

-- ─── TABLES ───────────────────────────────────────────────────────────────────

create table if not exists miniatures (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid references auth.users(id) on delete cascade,
  name                text not null,
  faction             text not null default '',
  unit_type           text not null default '',
  status              text not null default 'owned',
  notes               text not null default '',
  color_scheme_notes  text not null default '',
  photo_url           text not null default '',
  is_public           boolean not null default true,
  created_at          timestamptz default now()
);

create table if not exists miniature_paints (
  id            uuid primary key default uuid_generate_v4(),
  miniature_id  uuid references miniatures(id) on delete cascade,
  paint_name    text not null,
  paint_hex     text not null default '',
  paint_range   text not null default '',
  paint_brand   text not null default 'Citadel',
  part_name     text not null default '',
  usage_type    text not null default 'base',
  sort_order    int  not null default 0
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

alter table miniatures      enable row level security;
alter table miniature_paints enable row level security;

-- Anyone can read public minis; only owner can modify
create policy "Read public miniatures" on miniatures
  for select using (is_public = true or auth.uid() = user_id);

create policy "Own miniatures" on miniatures
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Paints inherit from their parent mini's ownership
create policy "Read paints of visible minis" on miniature_paints
  for select using (
    exists (
      select 1 from miniatures m
      where m.id = miniature_id
        and (m.is_public = true or m.user_id = auth.uid())
    )
  );

create policy "Own miniature_paints" on miniature_paints
  for all using (
    exists (select 1 from miniatures m where m.id = miniature_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from miniatures m where m.id = miniature_id and m.user_id = auth.uid())
  );

-- ─── STORAGE BUCKET ───────────────────────────────────────────────────────────
-- Create via Supabase dashboard: Storage → New bucket → "miniatures" → public
-- Then add this policy in Storage → miniatures → Policies:
--
--   Policy name: "Users manage own miniature photos"
--   Allowed operation: ALL
--   Target roles: authenticated
--   USING expression: (storage.foldername(name))[1] = auth.uid()::text
--
-- Public read policy (so gallery photos load for everyone):
--   Policy name: "Public read miniature photos"
--   Allowed operation: SELECT
--   Target roles: public
--   USING expression: true
