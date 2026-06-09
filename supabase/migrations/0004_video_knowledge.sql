-- =============================================================================
-- 0004 — Phase 5: deep Video Knowledge extraction
-- video_summaries now stores the full 10-field VideoKnowledge as a JSONB blob.
-- The legacy key_points/themes columns are kept (nullable) for back-compat reads.
-- =============================================================================

alter table video_summaries add column if not exists data jsonb not null default '{}';

-- Legacy columns are no longer written; relax NOT NULL if it was set.
alter table video_summaries alter column key_points drop not null;
alter table video_summaries alter column themes drop not null;
