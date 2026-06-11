-- =============================================================================
-- 0007 — Per-book cover illustration.
-- Stores the storage path (in the private 'exports' bucket) of the AI-generated
-- cover art, rendered full-bleed behind the typeset title on the PDF cover.
-- =============================================================================

alter table books add column if not exists cover_image_path text;
