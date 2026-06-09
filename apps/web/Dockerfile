# Web image — builds and serves the Next.js app (apps/web) for Railway.
# Mirrors the workers image: Chromium is present because the shared DI container
# can reach the Puppeteer PDF exporter from server routes.
FROM node:20-bookworm-slim

# Chromium from Debian's apt mirror (chunked + retried downloads are far more
# reliable in a build VM than Puppeteer's single bundled-download stream).
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app
COPY . .
# NODE_ENV=production (set above) makes pnpm skip devDependencies, but the Next.js
# build needs typescript + @types/* (devDeps) for its type-check step. --prod=false
# forces a full install so the build has them.
RUN pnpm install --frozen-lockfile --prod=false

# NEXT_PUBLIC_* are inlined into the client bundle at build time, so they must be
# real values here. Railway injects matching service variables as Docker build
# args automatically when an ARG of the same name is declared.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Placeholder server-side vars so any build-time env validation (zod) passes.
# Railway's real service variables override every one of these at runtime.
ENV SUPABASE_URL=https://placeholder.supabase.co \
    SUPABASE_ANON_KEY=placeholder \
    SUPABASE_SERVICE_ROLE_KEY=placeholder \
    ADMIN_EMAIL=placeholder@example.com \
    REDIS_URL=redis://localhost:6379 \
    ANTHROPIC_API_KEY=placeholder \
    YOUTUBE_API_KEY=placeholder

RUN pnpm --filter @yeg/web build

EXPOSE 3000
# `next start` binds 0.0.0.0 and honors the PORT env var that Railway injects.
CMD ["pnpm", "--filter", "@yeg/web", "start"]
