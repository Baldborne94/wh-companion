-- WH40K Companion — Store AI suggestions in the miniatures table
-- Run this in Supabase SQL editor.

ALTER TABLE miniatures
  ADD COLUMN IF NOT EXISTS ai_suggestions jsonb;
