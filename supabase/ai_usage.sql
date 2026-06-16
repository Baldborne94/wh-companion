-- Per-user daily usage counter for the AI Color Advisor.
-- Read/written only by the serverless proxy (api/paint-advisor.js) using the
-- Supabase service role, which bypasses RLS. RLS is enabled with no policies so
-- the table is not reachable from the client with the anon key.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  count   integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;
