import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card } from '../ui/card.js';
import { Sparkline } from './Sparkline.js';
import { SampleTag } from './SampleTag.js';
import type { ChannelMetric } from './data.js';
import { cn } from '../../lib/utils.js';

export function StatCard({ metric, sample }: { metric: ChannelMetric; sample?: boolean }) {
  const up = (metric.delta ?? 0) >= 0;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{metric.label}</p>
        {sample && <SampleTag />}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-3xl font-semibold tracking-tight tabular-nums">{metric.value}</p>
        <div className="h-8 w-24 shrink-0">
          <Sparkline data={metric.spark} positive={up} className="h-full w-full" />
        </div>
      </div>
      {metric.delta !== null && (
        <div
          className={cn(
            'mt-3 inline-flex items-center gap-1 text-xs font-medium',
            up ? 'text-success' : 'text-error',
          )}
        >
          {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
          {up ? '+' : ''}
          {metric.delta}%
          <span className="text-muted-foreground">vs. last period</span>
        </div>
      )}
    </Card>
  );
}
