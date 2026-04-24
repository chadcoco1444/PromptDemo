# Build stage
FROM node:20.11.1-bookworm-slim AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

COPY apps/web/ apps/web/

WORKDIR /repo/apps/web
RUN pnpm build

# Runtime stage
FROM node:20.11.1-bookworm-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /repo/apps/web/.next/standalone/ ./
COPY --from=builder /repo/apps/web/.next/static/ ./apps/web/.next/static/
COPY --from=builder /repo/apps/web/public/ ./apps/web/public/

EXPOSE 3001
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/web/server.js"]
