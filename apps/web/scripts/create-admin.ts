/**
 * Provision (or update) the single administrator account.
 *
 * This is a single-admin app — there is no self-service signup — so the one
 * allowed account is created here, out of band, using the Supabase service-role
 * key. Run it once after configuring `.env`:
 *
 *   pnpm admin:create
 *
 * Reads ADMIN_EMAIL / ADMIN_PASSWORD (the credentials to set) plus SUPABASE_URL
 * and SUPABASE_SERVICE_ROLE_KEY from the environment / repo-root `.env`. Safe to
 * re-run: if the account already exists, its password is reset to ADMIN_PASSWORD.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Load the repo-root .env into process.env without pulling in a dotenv dep.
function loadDotEnv() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  let text: string;
  try {
    text = readFileSync(resolve(root, '.env'), 'utf8');
  } catch {
    return; // No .env file — rely on the ambient environment instead.
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1]!;
    const raw = m[2] ?? '';
    if (process.env[key] !== undefined) continue; // Real env wins over the file.
    process.env[key] = raw.replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadDotEnv();

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  const missing = Object.entries({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey, ADMIN_EMAIL: email, ADMIN_PASSWORD: password })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    console.error(`Missing required env: ${missing.join(', ')}`);
    process.exit(1);
  }

  const supabase = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Look for an existing account with this email (admin.createUser errors if it
  // already exists, so we update instead of failing on re-runs).
  const { data: list, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error(`Failed to list users: ${listError.message}`);
    process.exit(1);
  }
  const existing = list.users.find((u) => u.email?.toLowerCase() === email!.toLowerCase());

  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, { password: password! });
    if (error) {
      console.error(`Failed to update admin: ${error.message}`);
      process.exit(1);
    }
    console.log(`✓ Admin account ${email} already existed — password reset.`);
  } else {
    const { error } = await supabase.auth.admin.createUser({
      email: email!,
      password: password!,
      email_confirm: true, // Skip the confirmation email; this is a trusted account.
    });
    if (error) {
      console.error(`Failed to create admin: ${error.message}`);
      process.exit(1);
    }
    console.log(`✓ Admin account ${email} created.`);
  }

  console.log('You can now sign in at /login with these credentials.');
}

main();
