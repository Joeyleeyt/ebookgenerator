import { HelpCircle, Layers, TrendingUp } from 'lucide-react';
import { Card } from '../ui/card.js';
import { SampleTag } from './SampleTag.js';
import type { AudienceInsight } from './data.js';

const KIND = {
  topic: { label: 'Trending topic', icon: TrendingUp, tone: 'text-secondary' },
  question: { label: 'Top question', icon: HelpCircle, tone: 'text-primary' },
  gap: { label: 'Content gap', icon: Layers, tone: 'text-warning' },
} as const;

export function AudienceInsights({ insights }: { insights: AudienceInsight[] }) {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Audience insights</h2>
          <p className="text-sm text-muted-foreground">What your viewers are asking for</p>
        </div>
        <SampleTag />
      </div>

      <ul className="flex flex-col divide-y divide-border">
        {insights.map((ins) => {
          const meta = KIND[ins.kind];
          const Icon = meta.icon;
          return (
            <li key={ins.text} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-surface-hover">
                <Icon className={`size-4 ${meta.tone}`} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{ins.text}</p>
                <p className="text-xs text-muted-foreground">{meta.label}</p>
              </div>
              <div className="flex w-24 items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
                  <div className="h-full rounded-full bg-brand-vivid" style={{ width: `${ins.weight}%` }} />
                </div>
                <span className="w-7 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                  {ins.weight}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
