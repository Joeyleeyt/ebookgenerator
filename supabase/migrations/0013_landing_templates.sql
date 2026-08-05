-- =============================================================================
-- 0013 — Cloned landing page templates.
--
-- Replaces the model-authored layouts of 0012. The difference is what is stored:
-- a `landing_layouts` row held CSS and markup that Claude WROTE after looking at
-- a reference site. A `landing_templates` row holds the reference site's OWN
-- rendered DOM and stylesheets, cleaned and parameterised. Nothing in it was
-- authored by a model — the only model output involved is a mapping of which
-- nodes hold product content, and that mapping is applied by deterministic code.
--
-- Consequences of that difference, both encoded below:
--
--   · Owner-scoped, unlike 0012. A layout was neutral markup with every word
--     stripped out, so sharing it across accounts cost nobody anything. A
--     template is a complete copy of a website — sharing one leaks which
--     template a seller uses, and raises an IP question that is not ours to
--     answer on the client's behalf.
--
--   · Blobs live in storage, not in the row. The rendered HTML plus a full CSS
--     bundle runs to hundreds of KB, and this project already learned what
--     multi-hundred-KB writes do to a single PostgREST request (see the
--     INLINE_WIDTHS docstring in GenerateLandingPageUseCase — Postgres 57014 on
--     one attempt, a Cloudflare 502 on the next). The row holds pointers.
-- =============================================================================

create type landing_template_state as enum ('EXTRACTING','READY','FAILED');

create table landing_templates (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users(id) on delete cascade,
  source_url            text not null,
  state                 landing_template_state not null default 'EXTRACTING',

  -- Human label, defaulted from the source page's <title>.
  name                  text,

  -- Paths in the private 'landing-assets' bucket.
  -- `original_html_path` is forensic: exactly what the browser rendered, before
  -- any cleaning. Kept so a fidelity complaint can be answered by diffing
  -- against what we actually saw, rather than against the live site as it is
  -- today.
  original_html_path    text,
  clean_html_path       text,   -- parameterised, carries {{TOKEN}}s
  css_bundle_path       text,

  -- [{ tplId, placeholder, kind, maxChars, originalText, hadInlineMarkup }]
  placeholder_map       jsonb not null default '[]'::jsonb,
  -- [{ key, containerTplId, originalCount, layoutMode, fields }]
  repeater_map          jsonb not null default '[]'::jsonb,
  -- { accentToken, accentValue, onAccentValue, isDark, rootTokens }
  theme_tokens          jsonb not null default '{}'::jsonb,
  -- { breakpoints: number[], sections: [{tplId, width, rect, paddingBlock, background}] }
  responsive_rules      jsonb not null default '{}'::jsonb,
  -- [{ width, storagePath }] — the visual baseline every generated page is
  -- diffed against.
  baseline_shots        jsonb not null default '[]'::jsonb,

  -- User corrections to the map, re-applied on every re-extraction so review
  -- work survives a refresh of the source site. Keyed on placeholder name
  -- rather than on tplId: node ids move when the source page changes, but the
  -- decision "this node is the hero subtitle" does not.
  placeholder_overrides jsonb not null default '[]'::jsonb,

  -- Warnings, unreplaced assets, font fidelity, cleaning loss. Surfaced in the
  -- UI: a template that lost its webfonts or dropped four photographs is still
  -- usable, but the seller must be told before they build a page on it.
  extraction_report     jsonb,
  failure_reason        text,

  -- Bumped in code (LANDING_PIPELINE_VERSION) on any change to capture,
  -- cleaning, annotation or parameterisation. This is what makes a pipeline fix
  -- reach existing templates instead of sitting behind a manual rebuild flag —
  -- the defect that made every prompt fix to the 0012 path invisible.
  pipeline_version      int  not null,
  revision              int  not null default 1,

  captured_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (owner_id, source_url, pipeline_version, revision)
);

create index landing_templates_owner on landing_templates (owner_id, state);

-- One row per re-hosted asset. Deliberately rows rather than a jsonb array on
-- the template: the deploy enumerates them, a future GC job needs to find
-- orphans, and content-hash dedup across templates falls out for free.
create table landing_template_assets (
  id             uuid primary key default gen_random_uuid(),
  template_id    uuid not null references landing_templates(id) on delete cascade,
  content_hash   text not null,
  -- Path inside the deployed site, e.g. 'assets/a1b2c3d4.woff2'.
  site_path      text not null,
  storage_path   text not null,
  content_type   text not null,
  byte_size      int  not null,
  kind           text not null,          -- 'image' | 'font' | 'other'
  source_url     text,
  -- False for a font whose licence does not permit redistribution. It is
  -- recorded (so the report can say the typeface degraded) but not stored, and
  -- the font-family stack falls back on the published page.
  rehosted       boolean not null default true,
  created_at     timestamptz not null default now(),

  unique (template_id, site_path)
);

create index landing_template_assets_template on landing_template_assets (template_id);

alter table landing_templates enable row level security;
create policy landing_templates_owner on landing_templates for all
  using (owner_id = auth.uid());

alter table landing_template_assets enable row level security;
create policy landing_template_assets_owner on landing_template_assets for all
  using (
    exists (
      select 1 from landing_templates t
      where t.id = landing_template_assets.template_id and t.owner_id = auth.uid()
    )
  );

-- ── landing_pages: which template, which engine, and how faithful ───────────
alter table landing_pages
  add column template_id uuid references landing_templates(id) on delete set null,
  -- 'clone' | 'builtin'. Today this is decided silently by whether a layout
  -- derivation happened to succeed, is logged once in the worker, and is
  -- invisible to the person looking at the page.
  add column engine      text not null default 'builtin',
  -- The bound slot values. Stored so one headline can be corrected and the page
  -- re-bound without re-asking Claude for the whole page.
  add column binding     jsonb,
  -- [{ sitePath, storagePath, contentType }] — what this page's deploy ships
  -- alongside index.html.
  add column assets      jsonb not null default '[]'::jsonb,
  -- The post-bind verification report. Publishing is gated on it having no
  -- BLOCKER-severity findings.
  add column fidelity    jsonb,
  -- Pointer into 'landing-assets', replacing the inline `html` column. Both
  -- exist during the migration; `html` is dropped once the clone engine is the
  -- default and no page is still being served from it.
  add column html_path   text;
