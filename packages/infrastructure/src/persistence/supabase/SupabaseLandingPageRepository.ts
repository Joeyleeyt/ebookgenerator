import type { SupabaseClient } from '@supabase/supabase-js';
import {
  LandingPage,
  LandingPageId,
  Palette,
  ProjectId,
  type LandingCopy,
  type LandingPageRepository,
  type LandingPageState,
} from '@yeg/core';
import { queryError } from './queryError.js';

interface LandingPageRow {
  id: string;
  project_id: string;
  state: LandingPageState;
  copy: LandingCopy | null;
  palette: Parameters<typeof Palette.rehydrate>[0] | null;
  html: string | null;
  site_id: string | null;
  deploy_id: string | null;
  url: string | null;
  input_hash: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export class SupabaseLandingPageRepository implements LandingPageRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findByProject(projectId: ProjectId): Promise<LandingPage | null> {
    const { data, error } = await this.db
      .from('landing_pages')
      .select('*')
      .eq('project_id', projectId.value)
      .maybeSingle();
    if (error) throw queryError('landing_pages', 'findByProject', error);
    return data ? this.toDomain(data as LandingPageRow) : null;
  }

  async save(page: LandingPage): Promise<void> {
    const props = page.toJSON();
    // project_id is unique, so it is the conflict target: the worker and a manual
    // regenerate can both write without racing to create a second row.
    const { error } = await this.db.from('landing_pages').upsert(
      {
        id: page.id.value,
        project_id: props.projectId,
        state: props.state,
        copy: props.copy,
        palette: props.palette ? props.palette.toJSON() : null,
        html: props.html,
        site_id: props.siteId,
        deploy_id: props.deployId,
        url: props.url,
        input_hash: props.inputHash,
        error: props.error,
        updated_at: props.updatedAt.toISOString(),
      },
      { onConflict: 'project_id' },
    );
    if (error) throw queryError('landing_pages', 'save', error);
  }

  async saveState(page: LandingPage): Promise<void> {
    const props = page.toJSON();
    // Update, not upsert: only state, error and the timestamp travel. The
    // multi-megabyte html/copy/palette columns stay untouched on disk.
    const { data, error } = await this.db
      .from('landing_pages')
      .update({ state: props.state, error: props.error, updated_at: props.updatedAt.toISOString() })
      .eq('id', page.id.value)
      .select('id');
    if (error) throw queryError('landing_pages', 'saveState', error);
    // First generation: the row does not exist yet, so there is nothing to
    // update. Fall through to the full save — cheap here, because a page that
    // has never been generated has no html to drag along.
    if (!data || data.length === 0) await this.save(page);
  }

  private toDomain(row: LandingPageRow): LandingPage {
    return LandingPage.rehydrate(
      {
        projectId: row.project_id,
        state: row.state,
        copy: row.copy,
        palette: row.palette ? Palette.rehydrate(row.palette) : null,
        html: row.html,
        siteId: row.site_id,
        deployId: row.deploy_id,
        url: row.url,
        inputHash: row.input_hash,
        error: row.error,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      },
      LandingPageId.from(row.id),
    );
  }
}
