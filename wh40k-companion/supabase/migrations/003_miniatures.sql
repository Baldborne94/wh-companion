-- WH40K Companion — Miniatures Catalog
-- Run this in Supabase SQL editor.

-- ─── TABLES ───────────────────────────────────────────────────────────────────

create table if not exists miniatures (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid references auth.users(id) on delete cascade,
  name                text not null,
  faction             text,
  unit_type           text,
  status              text not null default 'owned'
                        check (status in ('owned','assembled','base_coat','painted','completed')),
  notes               text,
  color_scheme_notes  text,
  photo_url           text,
  is_public           boolean not null default true,
  created_at          timestamptz default now()
);

create table if not exists miniature_paints (
  id           uuid primary key default uuid_generate_v4(),
  miniature_id uuid references miniatures(id) on delete cascade,
  paint_name   text not null,
  paint_hex    text,
  paint_range  text,
  paint_brand  text default 'Citadel',
  part_name    text,
  usage_type   text,
  sort_order   int  default 0,
  created_at   timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

alter table miniatures      enable row level security;
alter table miniature_paints enable row level security;

-- Anyone can read public miniatures; owners can do everything
create policy "Read public miniatures" on miniatures
  for select using (is_public = true or auth.uid() = user_id);

create policy "Own miniatures" on miniatures
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Paints are readable when the parent mini is readable
create policy "Read paints of public miniatures" on miniature_paints
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
-- Create via Supabase dashboard:
--   Storage → New bucket → name: "miniatures" → toggle Public ON → Save
--
-- Then add these two policies in Storage → miniatures → Policies:
--
--   Policy 1 — Public read
--     Policy name : "Public read miniatures"
--     Allowed operation: SELECT
--     Target roles: public
--     USING expression: true
--
--   Policy 2 — Authenticated upload/delete own folder
--     Policy name : "Users manage own miniature photos"
--     Allowed operation: ALL
--     Target roles: authenticated
--     USING expression: (storage.foldername(name))[1] = auth.uid()::text
