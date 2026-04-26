import 'reflect-metadata';
import './common/bigint';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  app.use(helmet());
  app.use(cookieParser());

  // Webhook endpoints need raw body for signature verification — register
  // express.raw BEFORE the global JSON parser kicks in (NestExpress applies
  // body parsers lazily on first request). The 256KB limit blocks oversized
  // payloads cheaply.
  app.use('/webhooks/cryptomus', express.raw({ type: '*/*', limit: '256kb' }));

  app.enableCors({
    origin: process.env.WEB_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  // Global ValidationPipe: keep `transform: true` (so class-validator DTOs
  // get type coercion) but DO NOT whitelist — Zod-based routes use their own
  // pipe and shouldn't have request bodies stripped before Zod sees them.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );

  // NB: Stage 1 has only /internal and /health/ready endpoints, so we do NOT
  // call setGlobalPrefix('v1', ...). Public /v1 will be enabled in Stage 6.

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  app.get(Logger).log(`API listening on http://localhost:${port}`);
}

void bootstrap();
