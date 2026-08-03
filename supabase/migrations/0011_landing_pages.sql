-- =============================================================================
-- 0011 — Sales landing pages.
-- One optional page per project: Claude writes the copy, the palette is derived
-- from the book's own cover art, and the rendered HTML is deployed to Netlify.
--
-- The rendered `html` is stored rather than re-rendered on demand so that the
-- bytes the user previewed are exactly the bytes that get published.
--
-- Commerce settings (price, checkout URL) deliberately live in projects.options
-- alongside the other per-project settings — this table holds only the
-- generated artifact and its deployment record.
-- =============================================================================

create type landing_page_state as enum ('GENERATING','DRAFT','PUBLISHING','PUBLISHED','FAILED');

create table landing_pages (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null unique references projects(id) on delete cascade,
  state       landing_page_state not null default 'GENERATING',
  copy        jsonb,
  palette     jsonb,
  html        text,
  -- Netlify identifiers; null until the first successful publish.
  site_id     text,
  deploy_id   text,
  url         text,
  -- Hash of every generation input — an unchanged hash short-circuits a re-run.
  input_hash  text,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Ownership flows through the project, matching every other child table.
alter table landing_pages enable row level security;
create policy landing_pages_owner on landing_pages for all
  using (exists (select 1 from projects p where p.id = landing_pages.project_id and p.owner_id = auth.uid()));
