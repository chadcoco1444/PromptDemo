# Single-stage on Playwright jammy (Chromium + glibc 2.35 compatible with Remotion)
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/
COPY packages/remotion/package.json packages/remotion/
COPY workers/render/package.json workers/render/

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile

COPY packages/schema/ packages/schema/
COPY packages/remotion/ packages/remotion/
COPY workers/render/ workers/render/

WORKDIR /repo/workers/render
ENV NODE_ENV=production

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "start"]
