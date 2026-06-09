import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Refreshes the Supabase session on every request (writes rotated cookies onto
 * the response) and gates the dashboard/editor pages behind authentication.
 * Runs on the edge runtime, so it reads the NEXT_PUBLIC_* env vars — never the
 * server-only @yeg/config schema.
 */
const PROTECTED_PREFIXES = ['/projects', '/dashboard'];

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // If public Supabase env is not configured, don't block rendering (e.g. local landing).
  if (!url || !anon) return res;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookiesToSet: CookieToSet[]) => {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Single-administrator app: only the ADMIN_EMAIL account counts as signed in.
  // (The API routes enforce this independently; this just gates page redirects.)
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const isAuthorized = !!user?.email && (!adminEmail || user.email.toLowerCase() === adminEmail);

  const path = req.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  if (!isAuthorized && isProtected) {
    const redirect = req.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.searchParams.set('next', path);
    return NextResponse.redirect(redirect);
  }

  return res;
}

export const config = {
  // Run on everything except static assets and API routes (those self-authorize).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
