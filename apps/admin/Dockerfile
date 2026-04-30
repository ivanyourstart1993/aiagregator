# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV AUTH_JWT_SECRET="build-stub-secret-do-not-use-in-runtime-min-32-bytes"
ENV NEXTAUTH_SECRET="build-stub-secret-do-not-use-in-runtime-min-32-bytes"
ENV NEXTAUTH_URL="http://localhost:3001"
ENV API_URL="http://localhost:4000"
COPY . .
# --no-frozen-lockfile because the new @aiagg/admin workspace package isn't
# in the committed lockfile yet. After the first deploy, regenerate the
# lockfile locally (pnpm install) and switch back to --frozen-lockfile.
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @aiagg/db prisma:generate \
 && pnpm --filter @aiagg/shared build \
 && pnpm --filter @aiagg/admin build
RUN set -e \
 && cp -R apps/admin/.next/static apps/admin/.next/standalone/apps/admin/.next/static \
 && if [ -d apps/admin/public ]; then cp -R apps/admin/public apps/admin/.next/standalone/apps/admin/public; fi

FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /repo/apps/admin/.next/standalone /app
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s \
  CMD wget -q -O- http://localhost:${PORT}/ || exit 1
CMD ["node", "apps/admin/server.js"]
