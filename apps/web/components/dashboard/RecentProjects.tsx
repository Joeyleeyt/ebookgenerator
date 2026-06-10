import Link from 'next/link';
import { Clock, Youtube } from 'lucide-react';
import { Badge } from '../ui/badge.js';
import { Card } from '../ui/card.js';
import { prettyChannel, timeAgo } from './format.js';
import { isActiveStatus } from './pipeline.js';
import type { ProjectItem } from './data.js';

function statusVariant(status: string) {
  if (status === 'COMPLETED') return 'success' as const;
  if (status === 'FAILED') return 'error' as const;
  if (status === 'PARTIAL') return 'warning' as const;
  return 'primary' as const;
}

export function RecentProjects({ projects }: { projects: ProjectItem[] }) {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight">Recent projects</h2>
        <Link href="/projects" className="text-sm font-medium text-primary hover:underline">
          View all
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No projects yet — start one from the dashboard above.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {projects.slice(0, 5).map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="-mx-2 flex items-center gap-3 rounded-input px-2 py-2.5 transition-colors hover:bg-surface-hover"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-hover">
                  <Youtube className="size-4 text-error" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{prettyChannel(p.channelUrl)}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {timeAgo(p.createdAt)}
                  </p>
                </div>
                <Badge variant={statusVariant(p.status)} className="capitalize">
                  {isActiveStatus(p.status) && (
                    <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />
                  )}
                  {p.status.toLowerCase().replace(/_/g, ' ')}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
