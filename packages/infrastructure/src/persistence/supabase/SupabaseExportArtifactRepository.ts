import type { SupabaseClient } from '@supabase/supabase-js';
import { ExportArtifact, ProjectId, type ExportArtifactRepository } from '@yeg/core';

export class SupabaseExportArtifactRepository implements ExportArtifactRepository {
  constructor(private readonly db: SupabaseClient) {}

  async save(artifact: ExportArtifact): Promise<void> {
    const { error } = await this.db.from('export_artifacts').insert({
      project_id: (artifact as unknown as { props: { projectId: string } }).props.projectId,
      format: artifact.format,
      storage_path: artifact.storagePath,
      page_count: artifact.pageCount,
    });
    if (error) throw new Error(error.message);
  }

  async findById(id: string): Promise<{ projectId: string; storagePath: string; format: string } | null> {
    const { data } = await this.db.from('export_artifacts').select('*').eq('id', id).maybeSingle();
    if (!data) return null;
    return { projectId: data.project_id, storagePath: data.storage_path, format: data.format };
  }

  async listByProject(projectId: ProjectId): Promise<ExportArtifact[]> {
    const { data } = await this.db.from('export_artifacts').select('*').eq('project_id', projectId.value);
    return (data ?? []).map((r) =>
      ExportArtifact.create({
        projectId: r.project_id,
        format: r.format,
        storagePath: r.storage_path,
        byteSize: r.byte_size ?? 0,
        pageCount: r.page_count ?? 0,
        bookVersion: r.book_version ?? 1,
      }),
    );
  }
}
