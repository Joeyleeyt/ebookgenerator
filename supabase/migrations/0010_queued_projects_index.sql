-- =============================================================================
-- 0010 — Index for the queued-project admission controller
-- Separate from 0009 because the 'QUEUED' enum value can only be referenced
-- once the transaction that added it has committed.
-- =============================================================================

-- Promotion picks a user's queued projects oldest-first; this keeps that on an
-- index rather than scanning every project the owner has ever created.
create index if not exists projects_owner_queued_idx
  on projects (owner_id, created_at)
  where status = 'QUEUED';
