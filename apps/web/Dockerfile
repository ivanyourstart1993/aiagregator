# syntax=docker/dockerfile:1.7
# Multi-stage Next.js standalone build for pnpm workspace monorepo.
# Build context: repo root.

ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

# ---------- deps ----------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
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
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm --filter @aiagg/db prisma:generate \
 && pnpm --filter @aiagg/shared build \
 && pnpm --filter @aiagg/web build

# ---------- runtime ----------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nextjs && adduser --system --uid 1001 next

# Next.js standalone output bundles all needed runtime deps
COPY --from=build --chown=next:nextjs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=next:nextjs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=next:nextjs /repo/apps/web/public ./apps/web/public

USER next
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s \
  CMD wget -q -O- http://localhost:${PORT}/ || exit 1

CMD ["node", "apps/web/server.js"]
