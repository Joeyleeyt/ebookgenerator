'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { Card } from '../ui/card.js';
import { Progress } from '../ui/progress.js';
import { Button } from '../ui/button.js';
import { resolvePipeline } from './pipeline.js';
import { prettyChannel } from './format.js';
import { cn } from '../../lib/utils.js';
import type { ProjectItem } from './data.js';

/**
 * The "AI is actively working" experience — no spinners-as-content. Renders the
 * live premium stage checklist for the most recent in-flight project, with a
 * progressive reveal. Driven by REAL project status from /api/projects.
 */
export function AIAnalysisPanel({ project }: { project: ProjectItem }) {
  const { stages, percent } = resolvePipeline(project.status);

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
        <ol className="flex flex-col gap-0.5">
          {stages.map((s, i) => (
            <motion.li
              key={s.label}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'flex items-center gap-3 rounded-input px-2 py-2 text-sm',
                s.state === 'active' && 'bg-surface-hover',
              )}
            >
              <span
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-full',
                  s.state === 'done' && 'bg-success text-white',
                  s.state === 'active' && 'bg-primary-soft text-primary animate-pulse-ring',
                  s.state === 'pending' && 'border border-border text-transparent',
                )}
              >
                {s.state === 'done' ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : s.state === 'active' ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : null}
              </span>
              <span
                className={cn(
                  s.state === 'done' && 'text-foreground',
                  s.state === 'active' && 'font-medium text-foreground',
                  s.state === 'pending' && 'text-muted-foreground',
                )}
              >
                {s.label}
              </span>
            </motion.li>
          ))}
        </ol>

        <div className="mt-5 flex items-center gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link href={`/projects/${project.id}`}>View pipeline</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
