-- =============================================================================
-- 0012 — Reusable landing-page layouts, one per reference template.
--
-- Before this, every book re-derived its own layout from the reference site.
-- That was expensive (a 30k-token Opus call per book) and, more importantly,
-- wrong: the client's requirement is that every page follow the SAME template,
-- and a fresh interpretation each run produces a different page each time.
--
-- A layout is now captured ONCE per (reference_url, mode) and reused. Its
-- markup carries {{COPY:key}} slots instead of any book's words, and `slots`
-- describes each one for the copywriter. Filling those slots is what makes a
-- page for a particular book.
--
-- Deliberately NOT owned by a project or a user: a layout is markup derived
-- from a public web page with the text removed, so there is nothing in it that
-- belongs to one account. Sharing it is what makes the cache worth having.
-- =============================================================================

create table landing_layouts (
  id            uuid primary key default gen_random_uuid(),
  -- The reference site this layout was copied from.
  reference_url text not null,
  -- 'single' | 'triple' — the two templates are not interchangeable, so each
  -- mode gets its own layout even from the same URL.
  mode          text not null default 'single',
  css           text not null,
  -- Markup with {{COPY:…}} slots where a book's prose goes.
  body_html     text not null,
  -- [{ key, purpose, maxChars }] — the brief handed to the copy call.
  slots         jsonb not null default '[]'::jsonb,
  -- Hash of the inputs that produced it; a change re-derives the layout.
  input_hash    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (reference_url, mode)
);

create index landing_layouts_lookup on landing_layouts (reference_url, mode);

-- Readable by any signed-in user (it is a template, not anyone's data); only
-- the service role writes, because layouts are produced by the worker.
alter table landing_layouts enable row level security;
create policy landing_layouts_read on landing_layouts for select
  using (auth.role() = 'authenticated');
