import { ArrowUpRight, FileText, TrendingUp } from 'lucide-react';
import { Card } from '../ui/card.js';
import { Badge } from '../ui/badge.js';
import type { BookOpportunity } from './data.js';
import { cn } from '../../lib/utils.js';

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-semibold tabular-nums text-foreground">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
        <div
          className={cn('h-full rounded-full', value >= 85 ? 'bg-success' : 'bg-brand')}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

const REVENUE_VARIANT = {
  High: 'success',
  Medium: 'primary',
  Emerging: 'secondary',
} as const;

export function OpportunityCard({ op }: { op: BookOpportunity }) {
  return (
    <Card interactive className="group flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <Badge variant={REVENUE_VARIANT[op.revenue]}>
          <TrendingUp className="size-3" />
          {op.revenue} revenue
        </Badge>
        <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
      </div>

      <h3 className="mt-3 text-base font-semibold leading-snug tracking-tight">{op.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{op.angle}</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Score label="Opportunity" value={op.opportunity} />
        <Score label="Demand" value={op.demand} />
      </div>

      <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <FileText className="size-3.5" />
        ~{op.estPages} pages
      </div>
    </Card>
  );
}
