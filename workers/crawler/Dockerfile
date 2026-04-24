# Single-stage build on the Playwright base image (Ubuntu 22.04 jammy + Node 20 + preinstalled browsers)
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

# tini for PID 1 zombie reaping (critical for headless chromium)
RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo

# Copy manifests first for reproducible install (better layer caching)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/
COPY workers/crawler/package.json workers/crawler/

# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 — the base image already has Chromium; the npm
# postinstall would otherwise redownload ~200MB. The Playwright npm package version
# (1.48.0 in workers/crawler/package.json) is aligned with the image tag.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/schema/ packages/schema/
COPY workers/crawler/ workers/crawler/

WORKDIR /repo/workers/crawler
ENV NODE_ENV=production

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "start"]
