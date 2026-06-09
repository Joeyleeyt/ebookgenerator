-- =============================================================================
-- 0003 — Phase 13: Optional Extra Content (front/back matter)
-- Book-level sections (introduction, foreword, conclusion, FAQ, bonus chapter,
-- resources, checklist, glossary), distinct from in-chapter `sections`.
-- =============================================================================

create type extra_content_kind as enum (
  'introduction', 'foreword', 'conclusion', 'faq',
  'bonus_chapter', 'resources', 'checklist', 'glossary'
);
create type matter_placement as enum ('front', 'back');

create table if not exists book_sections (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references books(id) on delete cascade,
  kind        extra_content_kind not null,
  placement   matter_placement not null,
  position    int not null,
  title       text not null,
  prompt      text,
  content     text,
  status      content_status not null default 'PENDING',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists book_sections_book_idx on book_sections (book_id, placement, position);

-- RLS: owner-scoped reads; workers write via the service-role key.
alter table book_sections enable row level security;
create policy "own book sections" on book_sections
  for select using (
    exists (
      select 1 from books b join projects p on p.id = b.project_id
      where b.id = book_id and p.owner_id = auth.uid()
    )
  );
