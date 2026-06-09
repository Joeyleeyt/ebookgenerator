import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { loadEnv } from '@yeg/config';

/**
 * Resolve the authenticated user from the Supabase session cookie (RLS subject).
 *
 * This app is single-administrator: only the account whose email matches
 * ADMIN_EMAIL is allowed in. Any other authenticated user is treated as
 * unauthenticated, so every API route that calls this rejects them with 401.
 */
export async function getUserId(): Promise<string | null> {
  const env = loadEnv();
  const cookieStore = cookies();
  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {
        /* route handlers set cookies via the response; no-op here */
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) return null;
  if (user.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) return null;
  return user.id;
}
