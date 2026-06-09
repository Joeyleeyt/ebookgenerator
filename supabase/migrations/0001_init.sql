-- YouTube Ebook Generator — initial schema
-- Multi-tenant via owner_id + RLS. Workers use the service-role key (bypass RLS).

-- ── enums ────────────────────────────────────────────────────────────────────
create type project_status as enum (
  'CREATED','INGESTING_CHANNEL','FETCHING_VIDEO_DATA','FETCHING_TRANSCRIPTS',
  'TRANSCRIBING_FALLBACK','SUMMARIZING_VIDEOS','SUMMARIZING_CHANNEL',
  'GENERATING_OUTLINE','GENERATING_TOPICS','GENERATING_CHAPTERS',
  'ASSEMBLING','EXPORTING','COMPLETED','PARTIAL','FAILED'
);
create type transcript_source as enum ('youtube','whisper');
create type job_state as enum ('PENDING','RUNNING','COMPLETED','FAILED');
create type content_status as enum ('PENDING','GENERATING','DONE','FAILED');
create type export_format as enum ('pdf','docx');

-- ── projects ─────────────────────────────────────────────────────────────────
create table projects (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  channel_url    text not null,
  status         project_status not null default 'CREATED',
  options        jsonb not null default '{}',
  pending_counts jsonb not null default '{}',
  version        int not null default 0,
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- bump version on every update (optimistic concurrency)
create or replace function bump_version() returns trigger language plpgsql as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;
create trigger projects_bump_version before update on projects
  for each row execute function bump_version();

-- ── channels ─────────────────────────────────────────────────────────────────
create table channels (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null unique references projects(id) on delete cascade,
  youtube_id       text not null,
  title            text not null,
  description      text,
  subscriber_count bigint,
  video_count      int,
  thumbnail_url    text,
  raw              jsonb,
  created_at       timestamptz not null default now()
);

-- ── videos ───────────────────────────────────────────────────────────────────
create table videos (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  youtube_id   text not null,
  title        text not null,
  description  text,
  published_at timestamptz,
  duration_s   int,
  view_count   bigint,
  position     int not null,
  has_audio    boolean not null default true,
  status       content_status not null default 'PENDING',
  created_at   timestamptz not null default now(),
  unique (project_id, youtube_id)
);
create index videos_project_idx on videos (project_id);

-- ── transcripts (1:1 video) ──────────────────────────────────────────────────
create table transcripts (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid not null unique references videos(id) on delete cascade,
  source     transcript_source not null,
  language   text,
  text       text not null,
  segments   jsonb,
  audio_ref  text,
  input_hash text not null,
  created_at timestamptz not null default now()
);

-- ── comments ─────────────────────────────────────────────────────────────────
create table comments (
  id           uuid primary key default gen_random_uuid(),
  video_id     uuid not null references videos(id) on delete cascade,
  youtube_id   text not null,
  author       text,
  text         text not null,
  like_count   int default 0,
  published_at timestamptz,
  unique (video_id, youtube_id)
);
create index comments_video_idx on comments (video_id);

-- ── video summaries ──────────────────────────────────────────────────────────
create table video_summaries (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid not null unique references videos(id) on delete cascade,
  summary    text not null,
  key_points jsonb,
  themes     jsonb,
  model      text not null,
  input_hash text not null,
  created_at timestamptz not null default now()
);

-- ── channel summary ──────────────────────────────────────────────────────────
create table channel_summaries (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects(id) on delete cascade,
  summary    text not null,
  topics     jsonb,
  audience   text,
  tone       text,
  input_hash text not null,
  created_at timestamptz not null default now()
);

-- ── books / outlines / chapters / sections ───────────────────────────────────
create table books (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null unique references projects(id) on delete cascade,
  title        text,
  target_pages int not null default 100,
  status       content_status not null default 'PENDING',
  created_at   timestamptz not null default now()
);

create table outlines (
  id         uuid primary key default gen_random_uuid(),
  book_id    uuid not null references books(id) on delete cascade,
  version    int not null default 1,
  structure  jsonb not null,
  input_hash text not null,
  created_at timestamptz not null default now(),
  unique (book_id, version)
);

create table chapters (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references books(id) on delete cascade,
  position    int not null,
  title       text not null,
  topic       text not null,
  word_target int not null,
  content     text,
  word_count  int default 0,
  status      content_status not null default 'PENDING',
  version     int not null default 1,
  input_hash  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (book_id, position)
);
create index chapters_book_idx on chapters (book_id, position);

create table chapter_versions (
  id         uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters(id) on delete cascade,
  version    int not null,
  content    text not null,
  created_at timestamptz not null default now(),
  unique (chapter_id, version)
);

create table sections (
  id         uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters(id) on delete cascade,
  position   int not null,
  title      text not null,
  prompt     text,
  content    text,
  status     content_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  unique (chapter_id, position)
);

-- ── exports ──────────────────────────────────────────────────────────────────
create table export_artifacts (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  format       export_format not null,
  storage_path text not null,
  byte_size    bigint,
  page_count   int,
  book_version int not null default 1,
  created_at   timestamptz not null default now()
);

-- ── job ledger (idempotency + audit) ─────────────────────────────────────────
create table job_runs (
  job_key    text primary key,
  project_id uuid not null references projects(id) on delete cascade,
  queue      text not null,
  state      job_state not null default 'PENDING',
  attempt    int not null default 0,
  input_hash text,
  result_ref text,
  error      text,
  updated_at timestamptz not null default now()
);
create index job_runs_project_idx on job_runs (project_id, queue, state);

-- ── atomic fan-in barrier ────────────────────────────────────────────────────
create or replace function decrement_pending(p_project uuid, p_stage text)
returns int language sql as $$
  update projects
     set pending_counts = jsonb_set(
           pending_counts, array[p_stage],
           to_jsonb(greatest(coalesce((pending_counts->>p_stage)::int, 0) - 1, 0)))
   where id = p_project
  returning coalesce((pending_counts->>p_stage)::int, 0);
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table projects enable row level security;
create policy projects_owner on projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- child tables inherit ownership via their project
alter table channels enable row level security;
alter table videos enable row level security;
alter table books enable row level security;
alter table channel_summaries enable row level security;
alter table export_artifacts enable row level security;

create policy channels_owner on channels for all
  using (exists (select 1 from projects p where p.id = channels.project_id and p.owner_id = auth.uid()));
create policy videos_owner on videos for all
  using (exists (select 1 from projects p where p.id = videos.project_id and p.owner_id = auth.uid()));
create policy books_owner on books for all
  using (exists (select 1 from projects p where p.id = books.project_id and p.owner_id = auth.uid()));
create policy channel_summaries_owner on channel_summaries for all
  using (exists (select 1 from projects p where p.id = channel_summaries.project_id and p.owner_id = auth.uid()));
create policy export_artifacts_owner on export_artifacts for all
  using (exists (select 1 from projects p where p.id = export_artifacts.project_id and p.owner_id = auth.uid()));

-- storage buckets (run via Supabase dashboard or storage API): 'audio' (private), 'exports' (private)
