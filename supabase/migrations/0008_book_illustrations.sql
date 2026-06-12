-- =============================================================================
-- 0008 — In-chapter illustrations.
-- AI-generated, full-color editorial illustrations placed throughout the book
-- (roughly one every five finished pages), each matched to the passage it sits
-- beside. Stored in the private 'exports' bucket and inlined as base64 at
-- assemble time (same reason as the cover: Paged.js drops network images after
-- re-chunking the DOM). `order_in_chapter` orders the illustrations within a
-- chapter; the renderer spreads them evenly across that chapter's paragraphs.
-- =============================================================================

create table if not exists book_illustrations (
  id               uuid primary key default gen_random_uuid(),
  book_id          uuid not null references books(id) on delete cascade,
  chapter_id       uuid not null references chapters(id) on delete cascade,
  order_in_chapter int not null,                 -- 0-based slot within the chapter
  storage_path     text not null,                -- path in the 'exports' bucket
  prompt           text,                          -- the (textless) prompt used, for debug/regen
  created_at       timestamptz not null default now(),
  unique (chapter_id, order_in_chapter)          -- idempotent upsert key
);

create index if not exists book_illustrations_book_id_idx on book_illustrations (book_id);
