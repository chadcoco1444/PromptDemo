# Slim node image — storyboard worker has no browser dependency
FROM node:20.11.1-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/
COPY workers/storyboard/package.json workers/storyboard/

RUN pnpm install --frozen-lockfile

COPY packages/schema/ packages/schema/
COPY workers/storyboard/ workers/storyboard/

WORKDIR /repo/workers/storyboard
ENV NODE_ENV=production

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "start"]
