import type { CSSProperties } from 'react';
import { colors } from '../app/ui.js';

/**
 * A small indeterminate spinner. Relies on the global `@keyframes spin`
 * defined in the root layout. `size` is the diameter in px; `color` tints
 * the leading arc (the rest of the ring stays faint).
 */
export function Spinner({
  size = 16,
  color = colors.accent,
  style,
}: {
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  const thickness = Math.max(2, Math.round(size / 8));
  return (
    <span
      aria-label="Loading"
      role="status"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${thickness}px solid ${colors.border}`,
        borderTopColor: color,
        animation: 'spin 0.7s linear infinite',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
