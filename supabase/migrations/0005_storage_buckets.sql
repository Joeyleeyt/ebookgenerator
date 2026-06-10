-- =============================================================================
-- 0005 — Storage buckets
-- Creates the private buckets the pipeline writes to, replacing the manual
-- "create these in the dashboard" note in 0001_init.sql with a reproducible
-- migration:
--   'exports' — rendered ebook artifacts (PDF/DOCX), served via signed URLs
--   'audio'   — Whisper audio-fallback downloads
-- Both are private. Worker clients use the service-role key, which bypasses
-- storage RLS, so no storage.objects policies are required for the pipeline.
-- Idempotent: safe to re-run.
-- =============================================================================

insert into storage.buckets (id, name, public)
values
  ('exports', 'exports', false),
  ('audio', 'audio', false)
on conflict (id) do nothing;
