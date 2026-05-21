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

export interface OutreachMailConfig {
  // Falls back to MailConfig.resendApiKey if unset.
  apiKey?: string;
  // Falls back to MailConfig.resendFrom. Format: 'Name <addr@domain>' or 'addr@domain'.
  from: string;
  // Optional Reply-To override. If unset, replies go to the From: address
  // (which only works if it's a real mailbox).
  replyTo?: string;
  webhookSecret?: string;
  inboundWebhookSecret?: string;
  // Optional: when an inbound reply is matched to a lead, also forward a copy
  // of the email body to this address (e.g. ops@... or a personal Gmail).
  // Replies are still recorded in Conversation/Message regardless.
  inboundForwardTo?: string;
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
  outreachMail: OutreachMailConfig;
  unsubscribeTokenSecret: string;
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
    outreachMail: {
      apiKey: env.RESEND_OUTREACH_API_KEY ?? env.RESEND_API_KEY,
      from: env.RESEND_OUTREACH_FROM ?? env.RESEND_FROM,
      replyTo: env.RESEND_OUTREACH_REPLY_TO,
      webhookSecret: env.RESEND_OUTREACH_WEBHOOK_SECRET,
      inboundWebhookSecret: env.RESEND_INBOUND_WEBHOOK_SECRET,
      inboundForwardTo: env.INBOUND_FORWARD_TO,
    },
    unsubscribeTokenSecret: env.UNSUBSCRIBE_TOKEN_SECRET,
  };
}
