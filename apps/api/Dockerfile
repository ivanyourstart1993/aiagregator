# syntax=docker/dockerfile:1.7
# Multi-stage build for NestJS API in a pnpm workspace monorepo.
# Build context: repo root.

ARG NODE_VERSION=20-alpine

# ---------- base ----------
FROM node:${NODE_VERSION} AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo
ENV NODE_ENV=production

# ---------- deps ----------
FROM base AS deps
ENV NODE_ENV=development
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY .npmrc ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/email-templates/package.json packages/email-templates/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---------- build ----------
FROM deps AS build
ENV NODE_ENV=development
COPY . .
RUN pnpm --filter @aiagg/db prisma:generate \
 && pnpm --filter @aiagg/shared build \
 && pnpm --filter @aiagg/db build \
 && pnpm --filter @aiagg/email-templates build \
 && pnpm --filter @aiagg/api exec tsc -p tsconfig.json

# ---------- runtime ----------
FROM node:${NODE_VERSION} AS runtime
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
ENV NODE_ENV=production PORT=4000

# Install only production deps for the api workspace
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages packages
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --prod --filter @aiagg/api... --ignore-scripts \
 && pnpm --filter @aiagg/db prisma:generate

# Copy compiled artifacts from build stage
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/db/dist ./packages/db/dist
COPY --from=build /repo/packages/email-templates/dist ./packages/email-templates/dist
COPY --from=build /repo/packages/db/prisma ./packages/db/prisma

EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s \
  CMD wget -q -O- http://localhost:${PORT}/health || exit 1

CMD ["node", "apps/api/dist/main.js"]
