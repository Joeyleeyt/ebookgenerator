import { Info } from 'lucide-react';
import { cn } from '../../lib/utils.js';

/**
 * Honest affordance: marks a value as illustrative sample data until the backend
 * exposes it. Hover for the explanation. Removing it is a one-line change once
 * the section is wired to real aggregates.
 */
export function SampleTag({ className }: { className?: string }) {
  return (
    <span
      title="Sample data — wired to a typed contract, pending backend exposure of pipeline analytics."
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning',
        className,
      )}
    >
      <Info className="size-2.5" />
      Sample
    </span>
  );
}
