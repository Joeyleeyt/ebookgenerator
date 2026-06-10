import { cn } from '../../lib/utils.js';

/**
 * Loading placeholder with a left-to-right shimmer (not a spinner) — used for
 * stat cards, opportunity cards, and the project grid while data resolves.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-md bg-surface-hover', className)}
      {...props}
    >
      <div className="shimmer-mask absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}

export { Skeleton };
