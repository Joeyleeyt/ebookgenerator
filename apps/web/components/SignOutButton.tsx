'use client';

import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../lib/supabase-browser.js';
import { ui } from '../app/ui.js';

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }
  return (
    <button onClick={signOut} style={ui.buttonGhost}>
      Sign out
    </button>
  );
}
