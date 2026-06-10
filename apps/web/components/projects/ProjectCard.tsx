import Link from 'next/link';
import { BookOpen, Clock } from 'lucide-react';
import { Badge } from '../ui/badge.js';
import { prettyChannel, timeAgo } from '../dashboard/format.js';
import { isActiveStatus, resolvePipeline } from '../dashboard/pipeline.js';

function statusVariant(status: string) {
  if (status === 'COMPLETED') return 'success' as const;
  if (status === 'FAILED') return 'error' as const;
  if (status === 'PARTIAL') return 'warning' as const;
  return 'primary' as const;
}

export interface ProjectCardData {
  id: string;
  channelUrl: string;
  status: string;
  createdAt: string;
}

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const active = isActiveStatus(project.status);
  const { percent } = resolvePipeline(project.status);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-soft transition-all duration-200 hover:-translate-y-1 hover:border-border-strong hover:shadow-card"
    >
      {/* Cover */}
      <div className="relative grid h-28 place-items-center bg-brand-vivid">
        <BookOpen className="size-10 text-white/90 drop-shadow" />
        <Badge
          variant={statusVariant(project.status)}
          className="absolute right-3 top-3 border-black/10 bg-black/30 capitalize text-white backdrop-blur-sm"
        >
          {active && <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />}
          {project.status.toLowerCase().replace(/_/g, ' ')}
        </Badge>
        {/* Progress hairline along the bottom of the cover */}
        {active && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
            <span className="block h-full bg-white/80 transition-[width] duration-500" style={{ width: `${percent}%` }} />
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <p className="truncate font-semibold">{prettyChannel(project.channelUrl)}</p>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" />
          {timeAgo(project.createdAt)}
        </div>
      </div>
    </Link>
  );
}
