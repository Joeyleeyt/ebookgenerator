import type { LandingPage } from '../../../domain/landing/LandingPage.js';
import type { ProjectId } from '../../../domain/project/ProjectId.js';

/** One landing page per project, so the project id is the natural lookup key. */
export interface LandingPageRepository {
  findByProject(projectId: ProjectId): Promise<LandingPage | null>;
  save(page: LandingPage): Promise<void>;
}
