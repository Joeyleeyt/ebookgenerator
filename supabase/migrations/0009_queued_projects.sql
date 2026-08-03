-- =============================================================================
-- 0009 — Queued projects
-- A user may submit any number of books; only MAX_ACTIVE_PROJECTS_PER_USER run
-- at once. The overflow is accepted and parked in QUEUED, then started by the
-- admission controller as running books reach a terminal state.
-- =============================================================================

-- Postgres enums are append-only; add the new value (idempotent).
-- NOTE: this file deliberately does nothing else. A value added by
-- `alter type ... add value` cannot be USED until the adding transaction has
-- committed, so anything referencing 'QUEUED' has to live in a later migration
-- (see 0010) or it fails with "unsafe use of new value of enum type".
alter type project_status add value if not exists 'QUEUED' before 'CREATED';
