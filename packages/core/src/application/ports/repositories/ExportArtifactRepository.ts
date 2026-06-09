import type { ExportArtifact } from '../../../domain/export/ExportArtifact.js';
import type { ProjectId } from '../../../domain/project/ProjectId.js';

export interface ExportArtifactRepository {
  save(artifact: ExportArtifact): Promise<void>;
  findById(id: string): Promise<{ projectId: string; storagePath: string; format: string } | null>;
  listByProject(projectId: ProjectId): Promise<ExportArtifact[]>;
}
