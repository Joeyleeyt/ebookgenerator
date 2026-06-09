'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { colors, accentGradient, navItem } from '../app/ui.js';

const NAV = [
  { label: 'Home', href: '/', icon: '🏠' },
  { label: 'Projects', href: '/projects', icon: '📚' },
  { label: 'Statistics', href: '/projects', icon: '📊', match: '__never__' },
  { label: 'Messages', href: '/projects', icon: '💬', match: '__never__' },
];

const THEMES = ['Light', 'Dark', 'System Default'];

export function Sidebar() {
  const pathname = usePathname() ?? '/';
  const [theme, setTheme] = useState('Dark');

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

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {NAV.map((item) => {
          const active = item.match === '__never__' ? false : item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link key={item.label} href={item.href} style={navItem(active)}>
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Theme switcher */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '0 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: colors.textDim, fontWeight: 600 }}>
          <span style={{ fontSize: 16 }}>🎨</span> Theme
        </div>
        {THEMES.map((t) => {
          const on = theme === t;
          return (
            <button
              key={t}
              onClick={() => setTheme(t)}
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
              {t}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
