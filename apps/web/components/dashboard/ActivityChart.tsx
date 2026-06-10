import { Activity } from 'lucide-react';
import { Card } from '../ui/card.js';
import type { ProjectItem } from './data.js';

/**
 * Recent-activity chart built from REAL project data — a cumulative "books
 * created" growth curve over the project history. No sample/demo data: an empty
 * workspace renders an honest empty state.
 */
function buildSeries(projects: ProjectItem[]): { points: number[]; labels: string[]; total: number } {
  const N = 8;
  const now = Date.now();
  const times = projects
    .map((p) => new Date(p.createdAt).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);

  // Window: from the first project (or the last 7 days, whichever is earlier) to now.
  const start = times.length ? Math.min(times[0]!, now - 7 * 86_400_000) : now - 7 * 86_400_000;
  const span = Math.max(1, now - start);

  const points: number[] = [];
  const labels: string[] = [];
  for (let i = 1; i <= N; i++) {
    const cutoff = start + (span * i) / N;
    points.push(times.filter((t) => t <= cutoff).length);
    labels.push(new Date(cutoff).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  }
  return { points, labels, total: times.length };
}

export function ActivityChart({ projects }: { projects: ProjectItem[] }) {
  const { points, labels, total } = buildSeries(projects);
  const W = 600;
  const H = 200;
  const max = Math.max(1, ...points);
  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = H - (v / max) * (H - 24) - 12;
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          <div>
            <h2 className="text-base font-semibold tracking-tight">Recent activity</h2>
            <p className="text-xs text-muted-foreground">Books created over time</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">{total}</p>
          <p className="text-xs text-muted-foreground">total</p>
        </div>
      </div>

      {total === 0 ? (
        <div className="grid h-44 place-items-center rounded-input border border-dashed border-border bg-grid text-sm text-muted-foreground">
          No activity yet — start a project to see your growth.
        </div>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-44 w-full" aria-hidden>
            <defs>
              <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.28" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Baseline grid */}
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1="0"
                x2={W}
                y1={H * f}
                y2={H * f}
                stroke="hsl(var(--border))"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path d={area} fill="url(#activity-fill)" />
            <path
              d={line}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {coords.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="3" fill="hsl(var(--primary))" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            {labels.map((l, i) => (
              <span key={i} className={i === 0 || i === labels.length - 1 ? '' : 'hidden sm:inline'}>
                {l}
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
