import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Project,
  ProjectId,
  ProjectStatus,
  GenerationOptions,
  ChannelUrl,
  type ProjectRepository,
  type ProjectListItem,
  type ProjectState,
  type Tone,
} from '@yeg/core';

interface ProjectRow {
  id: string;
  owner_id: string;
  channel_url: string;
  status: ProjectState;
  options: { targetPages: number; maxVideos: number; tone: Tone; includeComments: boolean };
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
        targetPages: project.options.targetPages,
        maxVideos: project.options.maxVideos,
        tone: project.options.tone,
        includeComments: project.options.includeComments,
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

  async decrementPending(id: ProjectId, stage: string): Promise<number> {
    const { data, error } = await this.db.rpc('decrement_pending', { p_project: id.value, p_stage: stage });
    if (error) throw new Error(error.message);
    return (data as number | null) ?? 0;
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
