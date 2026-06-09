'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client. Signs the user in/out and persists the session
 * in cookies (via @supabase/ssr) so the middleware and server route handlers can
 * read it. Reads the public env copies, which are inlined at build time.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return createBrowserClient(url, anon);
}
