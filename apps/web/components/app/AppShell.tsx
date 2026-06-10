import type { ReactNode } from 'react';
import { AppSidebar } from './AppSidebar.js';
import { MobileNav } from './MobileNav.js';

/**
 * Chrome for every authenticated surface: fixed sidebar (desktop), scrolling
 * content column, and a mobile bottom tab bar. Pages supply their own content
 * and their own in-page headers/actions.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
