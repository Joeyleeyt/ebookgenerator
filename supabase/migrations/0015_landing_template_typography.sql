-- The template's measured typography.
--
-- The clone pipeline strips every captured @font-face and re-adds only the
-- faces whose licence permits redistribution, but the font-family declarations
-- naming them survive untouched. With no record of what the typefaces WERE, a
-- face that could not be embedded left the page asking for a font nobody has,
-- and the browser fell back to its own default — so cloned pages matched their
-- template everywhere except the type.
--
-- Reading it from the live page rather than from the stylesheet is the point:
-- `font-family: var(--font-display)` only resolves to a real family in the
-- browser, and parsing the declaration is what previously made a serif template
-- come out sans-serif.
--
-- { heading: {family, stack, weight, serif} | null,
--   body:    {family, stack, weight, serif} | null,
--   familiesUsed: string[] }
alter table public.landing_templates
  add column if not exists typography_tokens jsonb not null default '{}'::jsonb;

-- Existing rows have no measurement and cannot be back-filled without
-- re-capturing the source site. LANDING_PIPELINE_VERSION is bumped to 2 in the
-- same change, so each template re-extracts on next use and populates this
-- then; until it does, the empty default reads back as "nothing measured",
-- which is the honest value and the one the code already handles.
