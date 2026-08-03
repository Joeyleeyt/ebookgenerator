import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Project,
  ProjectId,
  ProjectStatus,
  GenerationOptions,
  ChannelUrl,
  TERMINAL_STATES,
  type ProjectRepository,
  type ProjectListItem,
  type ProjectState,
  type Tone,
  type BookType,
} from '@yeg/core';

interface ProjectRow {
  id: string;
  owner_id: string;
  channel_url: string;
  status: ProjectState;
  options: {
    bookTitle?: string;
    bookType?: BookType;
    targetPages: number;
    maxVideos: number;
    recipeCount?: number;
    tone: Tone;
    includeComments: boolean;
    includeIllustrations?: boolean;
    illustrationEveryPages?: number;
  };
  pending_counts: Record<string, number>;
  version: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export class SupabaseProjectRepository implements ProjectRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findById(id: ProjectId): Promise<Project | null> {
    const { data, error } = await this.db.from('projects').select('*').eq('id', id.value).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toDomain(data as ProjectRow) : null;
  }

  async save(project: Project): Promise<void> {
    // Optimistic concurrency on version; row trigger bumps version on write.
    const { error } = await this.db.from('projects').upsert({
      id: project.id.value,
      owner_id: project.ownerId,
      channel_url: project.channelUrl.raw,
      status: project.status.value,
      options: {
        ...(project.options.bookTitle ? { bookTitle: project.options.bookTitle } : {}),
        bookType: project.options.bookType,
        targetPages: project.options.targetPages,
        maxVideos: project.options.maxVideos,
        recipeCount: project.options.recipeCount,
        tone: project.options.tone,
        includeComments: project.options.includeComments,
        includeIllustrations: project.options.includeIllustrations,
        illustrationEveryPages: project.options.illustrationEveryPages,
      },
      pending_counts: project.pendingCounts,
      error: project.error ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  async listByOwner(ownerId: string): Promise<ProjectListItem[]> {
    const { data, error } = await this.db
      .from('projects')
      .select('id, channel_url, status, created_at')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      channelUrl: r.channel_url as string,
      status: r.status as ProjectState,
      createdAt: r.created_at as string,
    }));
  }

  async countActiveByOwner(ownerId: string): Promise<number> {
    // Count-only query (head: true) — no rows shipped, just the number in flight.
    const { count, error } = await this.db
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId)
      .not('status', 'in', `(${TERMINAL_STATES.join(',')})`);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async decrementPending(id: ProjectId, stage: string): Promise<number> {
    const { data, error } = await this.db.rpc('decrement_pending', { p_project: id.value, p_stage: stage });
    if (error) throw new Error(error.message);
    return (data as number | null) ?? 0;
  }

  async advanceStatusAtomic(id: ProjectId, from: ProjectState[], to: ProjectState): Promise<boolean> {
    // Single guarded UPDATE: only rows whose status is still in `from` are
    // changed, so exactly one of several racing callers can win the transition.
    const { data, error } = await this.db
      .from('projects')
      .update({ status: to, updated_at: new Date().toISOString() })
      .eq('id', id.value)
      .in('status', from)
      .select('id');
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  }

  private toDomain(row: ProjectRow): Project {
    const url = ChannelUrl.create(row.channel_url);
    return Project.rehydrate(
      {
        ownerId: row.owner_id,
        channelUrl: url.isOk() ? url.value : ChannelUrl.create('https://youtube.com/@unknown').value,
        options: GenerationOptions.create(row.options),
        status: ProjectStatus.of(row.status),
        pendingCounts: row.pending_counts ?? {},
        version: row.version,
        ...(row.error ? { error: row.error } : {}),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      },
      ProjectId.from(row.id),
    );
  }
}
