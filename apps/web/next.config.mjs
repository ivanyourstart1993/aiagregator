import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Required so Next.js standalone tracing pulls in monorepo workspace deps.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@aiagg/shared'],
  // We run eslint + typecheck separately in CI; skip them in `next build`
  // to avoid duplication and reduce build memory pressure.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default withNextIntl(nextConfig);
