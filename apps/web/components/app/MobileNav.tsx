'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FolderKanban } from 'lucide-react';
import { cn } from '../../lib/utils.js';

// Mobile bottom nav — mirrors the built surfaces only.
const TABS = [
  { label: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects', href: '/projects', icon: FolderKanban },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-border bg-canvas/90 backdrop-blur-xl lg:hidden">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + '/');
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 transition-colors',
              active ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <Icon className={cn('size-5', active && 'text-primary')} />
            <span className="text-[10px] font-medium">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
