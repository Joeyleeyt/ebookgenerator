import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Workers and server-side handlers use the service-role key (bypasses RLS).
 * The browser/edge auth flow uses the anon key (handled in apps/web).
 */
export class SupabaseClientFactory {
  static serviceRole(url: string, serviceRoleKey: string): SupabaseClient {
    return createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
}
