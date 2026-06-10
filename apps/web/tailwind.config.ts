import type { Config } from 'tailwindcss';

/**
 * Design system for the redesign. Token values live as CSS custom properties in
 * globals.css (dark base on `:root`, light overrides on `[data-theme='light']`),
 * so the Tailwind utilities below stay theme-agnostic — `bg-surface` resolves to
 * whichever palette `<html data-theme>` selects. This mirrors the brief's tokens:
 *   bg #0A0B0F · surface #12141B · primary #6D5EF7 · secondary #00D4FF · etc.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: { center: true, padding: '2rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        canvas: 'hsl(var(--canvas))',
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          hover: 'hsl(var(--surface-hover))',
          raised: 'hsl(var(--surface-raised))',
        },
        border: 'hsl(var(--border))',
        'border-strong': 'hsl(var(--border-strong))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        foreground: 'hsl(var(--foreground))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          soft: 'hsl(var(--primary) / 0.14)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
          soft: 'hsl(var(--secondary) / 0.14)',
        },
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        error: 'hsl(var(--error))',
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
      },
      borderRadius: {
        // Brief: cards 20 · inputs/buttons 14 · modals 24
        button: '14px',
        input: '14px',
        card: '20px',
        modal: '24px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Brief type scale
        display: ['64px', { lineHeight: '1.04', letterSpacing: '-0.03em', fontWeight: '700' }],
        h1: ['48px', { lineHeight: '1.08', letterSpacing: '-0.025em', fontWeight: '700' }],
        h2: ['36px', { lineHeight: '1.12', letterSpacing: '-0.02em', fontWeight: '700' }],
        h3: ['28px', { lineHeight: '1.2', letterSpacing: '-0.015em', fontWeight: '600' }],
        caption: ['12px', { lineHeight: '1.4', letterSpacing: '0.01em' }],
      },
      spacing: {
        // Brief spacing scale (4·8·12·16·24·32·48·64·96) — the rest stay default
        '18': '4.5rem',
        '22': '5.5rem',
      },
      boxShadow: {
        soft: '0 1px 2px hsl(var(--shadow) / 0.4)',
        card: '0 8px 30px -12px hsl(var(--shadow) / 0.6)',
        lift: '0 18px 50px -16px hsl(var(--shadow) / 0.7)',
        glow: '0 12px 40px -8px hsl(var(--primary) / 0.45)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 hsl(var(--primary) / 0.5)' },
          '70%': { boxShadow: '0 0 0 8px hsl(var(--primary) / 0)' },
          '100%': { boxShadow: '0 0 0 0 hsl(var(--primary) / 0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.66, 0, 0, 1) infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
