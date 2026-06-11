-- =============================================================================
-- 0006 — Add Dedication & Acknowledgments to the extra-content kinds.
-- Every generated book now gets full publishing front/back matter:
--   Dedication → Foreword → Introduction → … chapters … → Conclusion → Acknowledgments
-- =============================================================================

alter type extra_content_kind add value if not exists 'dedication';
alter type extra_content_kind add value if not exists 'acknowledgments';
