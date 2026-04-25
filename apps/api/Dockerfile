# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @aiagg/db prisma:generate \
 && pnpm --filter @aiagg/shared build \
 && pnpm --filter @aiagg/db build \
 && pnpm --filter @aiagg/email-templates build \
 && pnpm --filter @aiagg/api exec nest build

FROM node:${NODE_VERSION} AS runtime
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo
ENV NODE_ENV=production PORT=4000
COPY --from=builder /repo /repo
WORKDIR /repo/apps/api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s \
  CMD wget -q -O- http://localhost:${PORT}/health || exit 1
CMD ["node", "dist/main.js"]
