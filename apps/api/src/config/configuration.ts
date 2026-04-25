import type { AppEnv } from './env.validation';

export interface AuthConfig {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtAccessTtl: number;
  apiKeyPepper: string;
}

export interface MailConfig {
  resendApiKey?: string;
  resendFrom: string;
  smtpHost: string;
  smtpPort: number;
  smtpFrom: string;
}

export interface RedisConfig {
  url: string;
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: AppEnv['LOG_LEVEL'];
  webUrl: string;
  databaseUrl: string;
  redis: RedisConfig;
  auth: AuthConfig;
  mail: MailConfig;
}

export function buildConfig(env: AppEnv): AppConfig {
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    webUrl: env.WEB_URL,
    databaseUrl: env.DATABASE_URL,
    redis: { url: env.REDIS_URL },
    auth: {
      jwtSecret: env.AUTH_JWT_SECRET,
      jwtIssuer: env.AUTH_JWT_ISSUER,
      jwtAudience: env.AUTH_JWT_AUDIENCE,
      jwtAccessTtl: env.AUTH_JWT_ACCESS_TTL,
      apiKeyPepper: env.API_KEY_PEPPER,
    },
    mail: {
      resendApiKey: env.RESEND_API_KEY,
      resendFrom: env.RESEND_FROM,
      smtpHost: env.SMTP_HOST,
      smtpPort: env.SMTP_PORT,
      smtpFrom: env.SMTP_FROM,
    },
  };
}
