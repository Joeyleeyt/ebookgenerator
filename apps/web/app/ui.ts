import type { CSSProperties } from 'react';

/**
 * Shared design tokens. The app uses a dark "dashboard" visual language:
 * a deep navy canvas, raised panels, a violet→pink accent, and soft borders.
 * Inline styles keep the dependency surface tiny (no CSS framework).
 */
export const colors = {
  canvas: '#0b0b12',
  sidebar: '#0d0d16',
  panel: '#13131c',
  panelRaised: '#171722',
  border: '#1e1e2a',
  borderSoft: '#181824',
  text: '#e9e9f0',
  textDim: '#8b8b9c',
  textFaint: '#5f5f70',
  accent: '#6d5efc',
  accent2: '#8b5cf6',
  pink: '#f7567c',
  pinkSoft: 'rgba(247, 86, 124, 0.18)',
  green: '#34d399',
  red: '#f87171',
  amber: '#fbbf24',
};

/** Violet→pink gradient used for the logo mark, active nav pill, and primary CTAs. */
export const accentGradient = `linear-gradient(135deg, ${colors.accent}, ${colors.pink})`;

export const ui = {
  input: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    color: colors.text,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  } as CSSProperties,
  button: {
    padding: '12px 20px',
    borderRadius: 10,
    border: 0,
    background: accentGradient,
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
    boxShadow: '0 8px 20px rgba(109, 94, 252, 0.25)',
  } as CSSProperties,
  buttonGhost: {
    padding: '10px 16px',
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    background: 'transparent',
    color: colors.text,
    cursor: 'pointer',
  } as CSSProperties,
  card: {
    display: 'block',
    padding: 16,
    borderRadius: 14,
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    color: 'inherit',
    textDecoration: 'none',
    marginTop: 12,
  } as CSSProperties,
  /** A raised content surface — the chart box, profile card, activity rail. */
  panel: {
    borderRadius: 18,
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    padding: 24,
  } as CSSProperties,
  badge: {
    fontSize: 12,
    padding: '3px 10px',
    borderRadius: 999,
    background: colors.panelRaised,
    color: colors.textDim,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  } as CSSProperties,
  link: { color: colors.accent, textDecoration: 'none' } as CSSProperties,
};

/** Coarse colour for a pipeline status, for the status pill. */
export function statusColor(status: string): string {
  if (status === 'COMPLETED') return colors.green;
  if (status === 'FAILED') return colors.red;
  if (status === 'PARTIAL') return colors.amber;
  return colors.accent;
}

/** Left-nav row; the active route gets the violet→pink gradient pill. */
export function navItem(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '11px 14px',
    borderRadius: 12,
    color: active ? '#fff' : colors.textDim,
    background: active ? accentGradient : 'transparent',
    boxShadow: active ? '0 8px 20px rgba(109, 94, 252, 0.30)' : 'none',
    fontWeight: active ? 600 : 500,
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'background 120ms ease, color 120ms ease',
  };
}
