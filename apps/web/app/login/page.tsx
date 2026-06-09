'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser.js';
import { ui, colors, accentGradient } from '../ui.js';
import { Spinner } from '../../components/Spinner.js';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/projects';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Single-administrator app: sign-in only. The one admin account is provisioned
  // out of band (see scripts/create-admin.ts), so there is no self-service signup.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return setMessage(error.message);
      router.push(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ ...ui.panel, width: '100%', maxWidth: 400, padding: 32 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: accentGradient,
            display: 'grid',
            placeItems: 'center',
            fontSize: 22,
            marginBottom: 18,
          }}
        >
          📖
        </div>
        <h1 style={{ margin: 0, fontSize: 26 }}>Sign in</h1>
        <p style={{ color: colors.textDim, marginTop: 6 }}>Administrator access.</p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
          <input style={ui.input} type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input style={ui.input} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          <button
            style={{ ...ui.button, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            type="submit"
            disabled={busy}
          >
            {busy && <Spinner size={14} color="#fff" />}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {message && <p style={{ marginTop: 16, color: colors.amber }}>{message}</p>}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
