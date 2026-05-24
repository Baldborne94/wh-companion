-- WH40K Companion — Add epub_cfi to reading_progress
-- Stores the exact EPUB CFI position so readers can resume from the same
-- location on any device, not just the overall progress percentage.

alter table reading_progress add column if not exists epub_cfi text;
