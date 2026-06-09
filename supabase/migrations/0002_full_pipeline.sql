-- =============================================================================
-- 0002 — Full 15-phase pipeline (logic.md)
-- Adds: comment analysis, channel knowledge base, book strategy, chapter
-- research, richer chapters, and the new pipeline states.
-- =============================================================================

-- ── new project states ───────────────────────────────────────────────────────
-- Postgres enums are append-only; add the new values (idempotent).
alter type project_status add value if not exists 'ANALYZING_COMMENTS' after 'SUMMARIZING_VIDEOS';
alter type project_status add value if not exists 'BUILDING_KNOWLEDGE_BASE' after 'ANALYZING_COMMENTS';
alter type project_status add value if not exists 'GENERATING_BOOK_STRATEGY' after 'BUILDING_KNOWLEDGE_BASE';
alter type project_status add value if not exists 'GENERATING_CHAPTER_RESEARCH' after 'GENERATING_OUTLINE';
alter type project_status add value if not exists 'POLISHING_BOOK' after 'GENERATING_CHAPTERS';

-- ── richer chapters (Phase 9) ────────────────────────────────────────────────
alter table chapters add column if not exists promise text not null default '';
alter table chapters add column if not exists key_points jsonb not null default '[]';

-- ── Phase 6 — comment insights (per video) ───────────────────────────────────
create table if not exists comment_insights (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid not null unique references videos(id) on delete cascade,
  data        jsonb not null,            -- CommentInsights.toJSON()
  input_hash  text not null,
  created_at  timestamptz not null default now()
);

-- ── Phase 7 — channel knowledge base (per project) ───────────────────────────
create table if not exists channel_knowledge_bases (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null unique references projects(id) on delete cascade,
  data        jsonb not null,            -- ChannelKnowledgeBase.toJSON()
  input_hash  text not null,
  created_at  timestamptz not null default now()
);

-- ── Phase 8 — book strategy (per project) ────────────────────────────────────
create table if not exists book_strategies (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null unique references projects(id) on delete cascade,
  data        jsonb not null,            -- BookStrategy.toJSON()
  input_hash  text not null,
  created_at  timestamptz not null default now()
);

-- ── Phase 10 — chapter research (per chapter) ────────────────────────────────
create table if not exists chapter_research (
  id          uuid primary key default gen_random_uuid(),
  chapter_id  uuid not null unique references chapters(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  data        jsonb not null,            -- ChapterResearch.toJSON()
  input_hash  text not null,
  created_at  timestamptz not null default now()
);

create index if not exists chapter_research_project_idx on chapter_research (project_id);

-- ── RLS: workers use the service-role key (bypass RLS); reads scoped per owner ─
alter table comment_insights enable row level security;
alter table channel_knowledge_bases enable row level security;
alter table book_strategies enable row level security;
alter table chapter_research enable row level security;

create policy "own knowledge base" on channel_knowledge_bases
  for select using (exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy "own book strategy" on book_strategies
  for select using (exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy "own chapter research" on chapter_research
  for select using (exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy "own comment insights" on comment_insights
  for select using (
    exists (
      select 1 from videos v join projects p on p.id = v.project_id
      where v.id = video_id and p.owner_id = auth.uid()
    )
  );
