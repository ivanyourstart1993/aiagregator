import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { buildConfig } from './config/configuration';
import { validateEnv, type AppEnv } from './config/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { RequestIdMiddleware, getRequestId } from './common/middleware/request-id.middleware';
import { PublicErrorFilter } from './common/filters/public-error.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AdminActionInterceptor } from './common/interceptors/admin-action.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { MailModule } from './modules/mail/mail.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';
import { BullMqModule } from './modules/bullmq/bullmq.module';
import { BillingModule } from './modules/billing/billing.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { PublicApiModule } from './modules/public-api/public-api.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { RateCardsModule } from './modules/rate-cards/rate-cards.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { RedisModule } from './common/redis/redis.module';
import { StorageModule } from './common/storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (raw): AppEnv & ReturnType<typeof buildConfig> => {
        const env = validateEnv(raw);
        const cfg = buildConfig(env);
        return Object.assign({}, env, cfg);
      },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true, colorize: true } },
        customProps: () => ({ requestId: getRequestId() }),
        autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie'],
          remove: true,
        },
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    PrismaModule,
    RedisModule,
    StorageModule,
    IdempotencyModule,
    BullMqModule,
    MailModule,
    AuthModule,
    UsersModule,
    ApiKeysModule,
    AdminModule,
    HealthModule,
    BillingModule,
    PaymentsModule,
    PricingModule,
    CouponsModule,
    CatalogModule,
    PublicApiModule,
    ProvidersModule,
    RateCardsModule,
    AnalyticsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: PublicErrorFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AdminActionInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
