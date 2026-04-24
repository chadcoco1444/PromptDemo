FROM node:20.11.1-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile

COPY packages/schema/ packages/schema/
COPY apps/api/ apps/api/

WORKDIR /repo/apps/api
ENV NODE_ENV=production

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "start"]
