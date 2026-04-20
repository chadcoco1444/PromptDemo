# Build stage
FROM node:20.11.1-bookworm-slim AS build
WORKDIR /repo

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy manifests for reproducible install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/
COPY workers/crawler/package.json workers/crawler/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/schema/ packages/schema/
COPY workers/crawler/ workers/crawler/

# Runtime stage
FROM mcr.microsoft.com/playwright:v1.48.0-jammy AS runtime

# tini for PID 1 zombie reaping (critical for headless chromium)
RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo
COPY --from=build /repo /repo

WORKDIR /repo/workers/crawler
ENV NODE_ENV=production

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "start"]
