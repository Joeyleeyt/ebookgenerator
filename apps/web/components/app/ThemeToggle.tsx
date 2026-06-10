'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type Theme } from '../../lib/theme.js';
import { cn } from '../../lib/utils.js';

const OPTIONS: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
];

/** Compact segmented control for the sidebar footer. */
export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="flex items-center gap-1 rounded-input border border-border bg-surface p-1">
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
          className={cn(
            'flex h-8 flex-1 items-center justify-center rounded-[9px] transition-colors',
            theme === value
              ? 'bg-surface-hover text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
