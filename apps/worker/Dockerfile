# syntax=docker/dockerfile:1.7
# Multi-stage Worker build (BullMQ processors).

ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

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

FROM deps AS build
COPY . .
RUN pnpm --filter @aiagg/db prisma:generate \
 && pnpm --filter @aiagg/shared build \
 && pnpm --filter @aiagg/db build \
 && pnpm --filter @aiagg/email-templates build \
 && pnpm --filter @aiagg/worker build

FROM node:${NODE_VERSION} AS runtime
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
ENV NODE_ENV=production
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages packages
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --frozen-lockfile --prod --filter @aiagg/worker... --ignore-scripts \
 && pnpm --filter @aiagg/db prisma:generate

COPY --from=build /repo/apps/worker/dist ./apps/worker/dist
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/db/dist ./packages/db/dist
COPY --from=build /repo/packages/email-templates/dist ./packages/email-templates/dist

CMD ["node", "apps/worker/dist/main.js"]
