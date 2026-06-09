import Link from 'next/link';
import { ui, colors, accentGradient } from './ui.js';

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ maxWidth: 620, textAlign: 'center' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: accentGradient,
            display: 'grid',
            placeItems: 'center',
            fontSize: 30,
            margin: '0 auto 28px',
            boxShadow: '0 16px 40px rgba(109, 94, 252, 0.35)',
          }}
        >
          📖
        </div>
        <h1 style={{ fontSize: 46, lineHeight: 1.1, margin: 0 }}>
          Turn a YouTube channel into a{' '}
          <span style={{ background: accentGradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>book.</span>
        </h1>
        <p style={{ color: colors.textDim, fontSize: 18, maxWidth: 520, margin: '20px auto 0' }}>
          Paste a channel URL and we generate a ~100-page ebook (PDF + DOCX) — a real, story-driven book, not a pile of
          video summaries.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 36, justifyContent: 'center' }}>
          <Link href="/projects" style={{ ...ui.button, textDecoration: 'none', padding: '14px 26px' }}>
            Get started
          </Link>
          <Link href="/login" style={{ ...ui.buttonGhost, textDecoration: 'none', padding: '14px 22px' }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
