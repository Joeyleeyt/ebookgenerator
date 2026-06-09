import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar.js';
import { colors } from '../app/ui.js';

/**
 * App chrome for authenticated/dashboard pages: a sticky sidebar, a top bar with
 * a search field and action icons, the main column, and an optional right rail.
 */
export function DashboardShell({
  children,
  rightRail,
  searchPlaceholder = 'Search projects, channels…',
  actions,
}: {
  children: ReactNode;
  rightRail?: ReactNode;
  searchPlaceholder?: string;
  actions?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: colors.canvas }}>
      <Sidebar />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '20px 28px',
            borderBottom: `1px solid ${colors.borderSoft}`,
          }}
        >
          <div
            style={{
              flex: 1,
              maxWidth: 520,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '11px 16px',
              borderRadius: 999,
              background: colors.panel,
              border: `1px solid ${colors.border}`,
              color: colors.textDim,
            }}
          >
            <span>🔍</span>
            <span style={{ fontSize: 14 }}>{searchPlaceholder}</span>
          </div>
          {actions && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>{actions}</div>
          )}
        </div>

        {/* Body: main + optional right rail */}
        <div style={{ flex: 1, display: 'flex', gap: 28, padding: 28, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
          {rightRail && (
            <div style={{ width: 330, flexShrink: 0, position: 'sticky', top: 28 }}>{rightRail}</div>
          )}
        </div>
      </div>
    </div>
  );
}
