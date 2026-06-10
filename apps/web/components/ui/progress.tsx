import { cn } from '../../lib/utils.js';

/**
 * Determinate progress bar (0–100). Lightweight, no Radix dependency — used for
 * book completion, export readiness, and opportunity scoring meters.
 */
export function Progress({
  value,
  className,
  indicatorClassName,
}: {
  value: number;
  className?: string;
  indicatorClassName?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-hover', className)}
    >
      <div
        className={cn('h-full rounded-full bg-brand transition-[width] duration-500 ease-out', indicatorClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
