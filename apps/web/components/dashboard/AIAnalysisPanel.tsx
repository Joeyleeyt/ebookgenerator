'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Card } from '../ui/card.js';
import { Progress } from '../ui/progress.js';
import { Button } from '../ui/button.js';
import { resolvePipeline } from './pipeline.js';
import { PipelineSteps } from './PipelineSteps.js';
import { prettyChannel } from './format.js';
import type { ProjectItem } from './data.js';

/**
 * The "AI is actively working" experience — no spinners-as-content. Renders the
 * live premium stage checklist for an in-flight project, with a progressive
 * reveal. Driven by REAL project status from /api/projects.
 *
 * Several books can run at once, so the dashboard gives the full checklist to
 * the newest one and renders the rest `compact` — header, progress and the
 * current stage only — keeping the column readable instead of stacking N
 * full-height checklists.
 */
export function AIAnalysisPanel({ project, compact = false }: { project: ProjectItem; compact?: boolean }) {
  const { stages, percent } = resolvePipeline(project.status);

  if (compact) {
    const current = stages.find((s) => s.state === 'active') ?? stages[stages.length - 1];
    return (
      <Card className="px-5 py-4">
        <Link href={`/projects/${project.id}`} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 truncate text-sm font-medium">
              {prettyChannel(project.channelUrl)}
            </p>
            <span className="text-xs font-semibold tabular-nums text-primary">{percent}%</span>
          </div>
          <Progress value={percent} />
          <p className="truncate text-xs text-muted-foreground">{current?.label ?? 'Working…'}</p>
        </Link>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <span className="grid size-9 place-items-center rounded-[11px] bg-primary-soft">
          <Sparkles className="size-4 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            Analyzing {prettyChannel(project.channelUrl)}
          </p>
          <p className="text-xs text-muted-foreground">AI is turning this channel into a book</p>
        </div>
        <span className="text-sm font-semibold tabular-nums text-primary">{percent}%</span>
      </div>

      <div className="px-6 py-5">
        <Progress value={percent} className="mb-5" />
        <PipelineSteps stages={stages} />

        <div className="mt-5 flex items-center gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link href={`/projects/${project.id}`}>View pipeline</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
