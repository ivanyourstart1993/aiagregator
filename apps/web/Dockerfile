# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV AUTH_JWT_SECRET="build-stub-secret-do-not-use-in-runtime-min-32-bytes"
ENV NEXTAUTH_SECRET="build-stub-secret-do-not-use-in-runtime-min-32-bytes"
ENV NEXTAUTH_URL="http://localhost:3000"
ENV API_URL="http://localhost:4000"
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @aiagg/db prisma:generate \
 && pnpm --filter @aiagg/shared build \
 && pnpm --filter @aiagg/web build
# Stage standalone artifacts together so the runtime layer can copy a single tree.
RUN set -e \
 && cp -R apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static \
 && cp -R apps/web/public apps/web/.next/standalone/apps/web/public

FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /repo/apps/web/.next/standalone /app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s \
  CMD wget -q -O- http://localhost:${PORT}/ || exit 1
CMD ["node", "apps/web/server.js"]
