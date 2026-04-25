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
 && pnpm --filter @aiagg/worker build

FROM node:${NODE_VERSION} AS runtime
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=builder /repo /repo
WORKDIR /repo/apps/worker
CMD ["node", "dist/main.js"]
