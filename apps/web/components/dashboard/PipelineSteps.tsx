'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import type { ResolvedStage, ResolvedSubStep, StageState } from './pipeline.js';
import { cn } from '../../lib/utils.js';

export interface StepCounter {
  done: number;
  total: number;
}

/** Live counter for a sub-step, keyed by its pendingCounts barrier. */
export type Counters = Record<string, StepCounter>;

export interface ItemProgress {
  id: string;
  title: string;
  state: StageState | 'failed';
}

/** Per-item lists keyed by sub-step itemsKey ('videos' | 'chapters'). */
export type ItemMap = Record<string, ItemProgress[]>;

function ItemList({ items }: { items: ItemProgress[] }) {
  const done = items.filter((i) => i.state === 'done').length;
  return (
    <div className="ml-6 mt-1.5 rounded-input border border-border bg-canvas/40">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {items.length} items
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{done} done</span>
      </div>
      <ul className="max-h-44 overflow-y-auto py-1">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2.5 px-3 py-1">
            <span
              className={cn(
                'grid size-3.5 shrink-0 place-items-center rounded-full',
                it.state === 'done' && 'text-success',
                it.state === 'active' && 'text-primary',
                it.state === 'failed' && 'text-error',
                it.state === 'pending' && 'text-muted-foreground/40',
              )}
            >
              {it.state === 'done' ? (
                <Check className="size-2.5" strokeWidth={3.5} />
              ) : it.state === 'active' ? (
                <Loader2 className="size-3 animate-spin" />
              ) : it.state === 'failed' ? (
                <span className="text-[10px] font-bold">!</span>
              ) : (
                <span className="size-1.5 rounded-full bg-current" />
              )}
            </span>
            <span
              className={cn(
                'truncate text-xs',
                it.state === 'active' && 'font-medium text-foreground',
                it.state === 'pending' && 'text-muted-foreground',
                (it.state === 'done' || it.state === 'failed') && 'text-foreground/80',
              )}
            >
              {it.title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SubStepRow({
  sub,
  counter,
  items,
}: {
  sub: ResolvedSubStep;
  counter?: StepCounter | undefined;
  items?: ItemProgress[] | undefined;
}) {
  const showCount = counter && counter.total > 0;
  const pct = showCount ? Math.round((counter!.done / counter!.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5 py-1.5">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'grid size-3.5 shrink-0 place-items-center rounded-full',
            sub.state === 'done' && 'bg-success/20 text-success',
            sub.state === 'active' && 'text-primary',
            sub.state === 'pending' && 'text-muted-foreground/40',
          )}
        >
          {sub.state === 'done' ? (
            <Check className="size-2.5" strokeWidth={3.5} />
          ) : sub.state === 'active' ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <span className="size-1.5 rounded-full bg-current" />
          )}
        </span>
        <span
          className={cn(
            'flex-1 text-[13px]',
            sub.state === 'pending' ? 'text-muted-foreground' : 'text-foreground/90',
          )}
        >
          {sub.label}
        </span>
        {showCount && (
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
            {counter!.done}/{counter!.total} {sub.unit}
          </span>
        )}
      </div>
      {showCount && sub.state === 'active' && (
        <div className="ml-6 h-1 overflow-hidden rounded-full bg-surface-hover">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {items && items.length > 0 && <ItemList items={items} />}
    </div>
  );
}

export function PipelineSteps({
  stages,
  counters = {},
  items = {},
}: {
  stages: ResolvedStage[];
  counters?: Counters;
  items?: ItemMap;
}) {
  // User toggles override the default (active stage open). Keyed by stage label.
  const [override, setOverride] = useState<Record<string, boolean>>({});

  return (
    <ol className="flex flex-col gap-0.5">
      {stages.map((stage, i) => {
        const open = override[stage.label] ?? stage.state === 'active';
        return (
          <motion.li
            key={stage.label}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'rounded-input',
              stage.state === 'active' && 'bg-surface-hover/60',
            )}
          >
            <button
              type="button"
              onClick={() => setOverride((o) => ({ ...o, [stage.label]: !open }))}
              className="flex w-full items-center gap-3 rounded-input px-2 py-2.5 text-left text-sm"
            >
              <span
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-full',
                  stage.state === 'done' && 'bg-success text-white',
                  stage.state === 'active' && 'bg-primary-soft text-primary animate-pulse-ring',
                  stage.state === 'pending' && 'border border-border text-transparent',
                )}
              >
                {stage.state === 'done' ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : stage.state === 'active' ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : null}
              </span>
              <span
                className={cn(
                  'flex-1',
                  stage.state === 'pending' ? 'text-muted-foreground' : 'text-foreground',
                  stage.state === 'active' && 'font-medium',
                )}
              >
                {stage.label}
              </span>
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform',
                  open && 'rotate-180',
                )}
              />
            </button>

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="ml-[18px] border-l border-border pl-4 pr-2 pb-1">
                    {stage.substeps.map((sub) => (
                      <SubStepRow
                        key={sub.label}
                        sub={sub}
                        counter={sub.barrier ? counters[sub.barrier] : undefined}
                        items={sub.itemsKey ? items[sub.itemsKey] : undefined}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </ol>
  );
}
