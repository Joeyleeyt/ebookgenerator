'use client';

import Link from 'next/link';
import { colors, accentGradient } from '../app/ui.js';
import { useTheme, type Theme } from '../lib/theme.js';
import { SignOutButton } from './SignOutButton.js';

const THEMES: { label: string; value: Theme }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System Default', value: 'system' },
];

export function Sidebar() {
  const [theme, setTheme] = useTheme();

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        background: colors.sidebar,
        borderRight: `1px solid ${colors.borderSoft}`,
        padding: '28px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}
    >
      {/* Logo */}
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', padding: '0 8px' }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            background: accentGradient,
            display: 'grid',
            placeItems: 'center',
            fontSize: 16,
          }}
        >
          📖
        </span>
        <span style={{ color: colors.text, fontWeight: 700, letterSpacing: 2, fontSize: 18 }}>EBOOKLY</span>
      </Link>

      {/* Bottom group: theme switcher + sign out */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 18, padding: '0 8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: colors.textDim, fontWeight: 600 }}>
            <span style={{ fontSize: 16 }}>🎨</span> Theme
          </div>
          {THEMES.map((t) => {
            const on = theme === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTheme(t.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: 'none',
                  border: 0,
                  padding: '2px 0',
                  cursor: 'pointer',
                  color: on ? colors.text : colors.textFaint,
                  fontSize: 14,
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: `2px solid ${on ? colors.pink : colors.textFaint}`,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {on && <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors.pink }} />}
                </span>
                {t.label}
              </button>
            );
          })}
        </div>

        <SignOutButton />
      </div>
    </aside>
  );
}
