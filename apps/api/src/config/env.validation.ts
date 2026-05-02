import { z } from 'zod';

const optionalUrl = z
  .string()
  .url()
  .optional()
  .or(z.literal('').transform(() => undefined));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url().default('redis://localhost:6379'),

    AUTH_JWT_SECRET: z.string().min(32, 'AUTH_JWT_SECRET must be at least 32 chars'),
    AUTH_JWT_ISSUER: z.string().default('aiagg'),
    AUTH_JWT_AUDIENCE: z.string().default('aiagg-api'),
    AUTH_JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),

    API_KEY_PEPPER: z.string().min(16, 'API_KEY_PEPPER must be at least 16 chars'),

    WEB_URL: z.string().url().default('http://localhost:3000'),

    RESEND_API_KEY: z.string().optional().or(z.literal('').transform(() => undefined)),
    RESEND_FROM: z.string().default('onboarding@example.com'),

    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_FROM: z.string().default('onboarding@localhost'),

    GOOGLE_CLIENT_ID: z.string().optional().or(z.literal('').transform(() => undefined)),
    GOOGLE_CLIENT_SECRET: z.string().optional().or(z.literal('').transform(() => undefined)),

    SEED_SUPERADMIN_EMAIL: z.string().email().default('admin@example.com'),
    SEED_SUPERADMIN_PASSWORD: z.string().default('change-me-on-first-login'),

    // Stage 7+ — object storage (MinIO / S3-compatible)
    S3_ENDPOINT: z.string().default('http://localhost:9000'),
    S3_REGION: z.string().default('us-east-1'),
    S3_ACCESS_KEY: z.string().default('minioadmin'),
    S3_SECRET_KEY: z.string().default('minioadmin'),
    S3_BUCKET: z.string().default('aiagg-results'),
    S3_FORCE_PATH_STYLE: z.string().default('true'),
    // Public-facing base URL for result file downloads. Set this when
    // S3_ENDPOINT points at a cluster-internal addon that's not reachable
    // from the public internet (e.g. Northflank's *.addon.code.run). Files
    // are served by FilesController under this prefix.
    // Example: https://api.aigenway.com/v1/files
    S3_PUBLIC_BASE_URL: z.string().optional(),

    // Stage 7 — single-key fallback (later moved into ProviderAccount.credentials)
    GOOGLE_BANANA_API_KEY: z.string().optional().or(z.literal('').transform(() => undefined)),

    // Stage 10 — webhook callback dispatch
    WEBHOOK_SECRET: z.string().min(16).default('dev-webhook-secret-change-me'),
    CALLBACK_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    CALLBACK_BACKOFF_MS: z.coerce.number().int().positive().default(2000),

    // Security — shared with /internal/* guards, OAuth bridge, credentials
    // encryption, and SSRF-safe fetcher. In production all four are required
    // (the guards/helpers will throw at request time if missing); in dev we
    // allow them to be absent and degrade gracefully.
    INTERNAL_SERVICE_SECRET: z.string().min(32).optional(),
    CREDENTIALS_KEK: z.string().min(32).optional(),
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    SSRF_FETCH_MAX_BYTES: z.coerce.number().int().positive().optional(),
    SSRF_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
    SSRF_FETCH_MAX_REDIRECTS: z.coerce.number().int().nonnegative().optional(),
    SSRF_EXTRA_ALLOW: z.string().optional(),
    TRUST_PROXY: z.string().optional(),

    // Test/dev convenience flag that auto-verifies new registrations without
    // an email round-trip. Hard-blocked in production: leaving this on lets
    // an attacker race-register a victim's email and lock them out.
    EMAIL_AUTO_VERIFY: z.string().optional(),
  })
  .passthrough()
  .refine(
    (env) =>
      env.NODE_ENV !== 'production' ||
      (Boolean(env.INTERNAL_SERVICE_SECRET) && Boolean(env.CREDENTIALS_KEK)),
    {
      message:
        'INTERNAL_SERVICE_SECRET and CREDENTIALS_KEK are required in production',
    },
  )
  .refine(
    (env) =>
      env.NODE_ENV !== 'production' || env.EMAIL_AUTO_VERIFY !== 'true',
    {
      message:
        'EMAIL_AUTO_VERIFY=true is forbidden in production (enables email pre-claim attack)',
    },
  );

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  // The placeholder URL silently becomes undefined; this matches our optional* helpers.
  void optionalUrl;
  return parsed.data;
}
