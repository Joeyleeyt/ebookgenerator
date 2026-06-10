'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, BookMarked, Loader2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser.js';
import { Button } from '../../components/ui/button.js';
import { cn } from '../../lib/utils.js';

const FIELD =
  'h-11 w-full rounded-input border border-border bg-surface px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/dashboard';

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
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-6">
      {/* Ambient brand glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />

      <div className="relative w-full max-w-sm rounded-card border border-border bg-surface p-8 shadow-card">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-[12px] bg-brand-vivid shadow-glow">
            <BookMarked className="size-5 text-white" />
          </span>
          <span className="text-lg font-bold tracking-tight">Ebookly</span>
        </Link>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to your workspace.</p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
              Email
            </label>
            <input
              id="email"
              className={FIELD}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
              Password
            </label>
            <input
              id="password"
              className={FIELD}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" size="lg" disabled={busy} className="mt-2 w-full">
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        {message && (
          <div
            className={cn(
              'mt-4 flex items-start gap-2 rounded-input border border-error/30 bg-error/5 p-3 text-sm text-error',
            )}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}
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
