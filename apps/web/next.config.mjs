import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Next only auto-loads `.env` files from this app directory, but in this monorepo
 * the single source of truth is the repo-root `.env` (the same file Docker's
 * `env_file` and the workers loader read). Load it here — in the Next process,
 * before compilation — so both the server-side `loadEnv()` and the build-time
 * `NEXT_PUBLIC_*` inlining see the values. Real/ambient env wins over the file.
 */
function loadRepoRootEnv() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  let text;
  try {
    text = readFileSync(resolve(root, '.env'), 'utf8');
  } catch {
    return; // No .env — rely on the ambient environment instead.
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue; // Real env wins over the file.
    process.env[key] = (m[2] ?? '').replace(/^["']|["']$/g, '');
  }
}

loadRepoRootEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The DI container pulls in server-only adapters (Puppeteer, BullMQ, pg).
  // Keep them external so Next does not try to bundle them into edge/client code.
  // Next 14 namespaces this under `experimental`; it graduated to a top-level
  // key in Next 15. Keep these server-only adapters out of the bundle.
  experimental: {
    serverComponentsExternalPackages: [
      '@yeg/infrastructure',
      '@yeg/config',
      'bullmq',
      'ioredis',
      'puppeteer',
      'pino',
      '@anthropic-ai/sdk',
      'googleapis',
      // Supabase pulls in Node-only APIs (process.version, path resolution) that
      // can't be bundled into the server build — bundling it makes page-data
      // collection throw `path.dirname` on a webpack module id. Externalize so
      // it's required at runtime. (Client components still bundle it normally;
      // this setting only affects the server bundle.)
      '@supabase/ssr',
      '@supabase/supabase-js',
    ],
  },
  transpilePackages: ['@yeg/core'],
  // The codebase uses ESM-style `.js` extensions in relative imports (e.g.
  // `import { ui } from './ui.js'` resolving to `ui.ts`). Tell webpack to map
  // `.js` requests back to TS sources so those imports resolve.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    // Puppeteer's config loader (cosmiconfig → import-fresh) uses a dynamic
    // `require(variable)`, which webpack flags as "Critical dependency: the
    // request of a dependency is an expression". It's reached transitively via
    // the server-only PuppeteerPdfExporter in the DI container and is harmless
    // (Puppeteer is externalized for server use), so silence just that warning.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /node_modules[\\/]\.pnpm[\\/](import-fresh|cosmiconfig)@/, message: /Critical dependency/ },
    ];
    return config;
  },
};

export default nextConfig;
