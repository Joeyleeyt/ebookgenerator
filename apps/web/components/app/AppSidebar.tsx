'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BookMarked, LogOut } from 'lucide-react';
import { PRIMARY_NAV, type NavItem } from './nav.js';
import { ThemeToggle } from './ThemeToggle.js';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser.js';
import { cn } from '../../lib/utils.js';

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        'group relative flex items-center gap-3 rounded-input px-3 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'bg-surface-hover text-foreground'
          : 'text-muted-foreground hover:bg-surface-hover/60 hover:text-foreground',
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-vivid" />
      )}
      <Icon className={cn('size-[18px]', active && 'text-primary')} />
      <span className="flex-1">{item.label}</span>
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col border-r border-border bg-surface/40 px-4 py-6 lg:flex">
      {/* Brand */}
      <Link href="/dashboard" className="mb-8 flex items-center gap-2.5 px-2">
        <span className="grid size-9 place-items-center rounded-[11px] bg-brand-vivid shadow-glow">
          <BookMarked className="size-5 text-white" />
        </span>
        <span className="text-[17px] font-bold tracking-tight">Ebookly</span>
      </Link>

      {/* Primary nav */}
      <nav className="flex flex-col gap-1">
        {PRIMARY_NAV.map((item) => (
          <NavRow key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>

      {/* Footer */}
      <div className="mt-auto flex flex-col gap-3 pt-6">
        <ThemeToggle />
        <button
          onClick={signOut}
          className="flex items-center gap-3 rounded-input px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <LogOut className="size-[18px]" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
