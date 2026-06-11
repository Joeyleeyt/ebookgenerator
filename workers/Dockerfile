# Worker image — runs the BullMQ processors. Includes yt-dlp + ffmpeg for the
# Whisper audio-download fallback, and Chromium for the PDF exporter.
# Node 22 (not 20): @supabase/supabase-js >=2.108 requires a native WebSocket,
# which only exists from Node 22 — on Node 20 the SupabaseClient constructor
# throws "Node.js 20 detected without native WebSocket support" at boot.
FROM node:22-bookworm-slim

# Install Chromium from Debian's apt mirror rather than letting Puppeteer pull
# its own bundled build from Google — apt downloads are chunked + retried, which
# is far more reliable inside Docker's VM than Puppeteer's single long stream.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium ffmpeg python3 python3-pip ca-certificates \
    && pip3 install --no-cache-dir --break-system-packages yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Skip Puppeteer's Chromium download at install time and point it at the
# apt-installed binary at runtime. PuppeteerPdfExporter launches with no
# explicit executablePath, so it honors PUPPETEER_EXECUTABLE_PATH.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

CMD ["pnpm", "workers"]
