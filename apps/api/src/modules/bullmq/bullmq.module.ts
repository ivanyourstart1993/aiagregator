import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConnectionOptions } from 'bullmq';
import {
  CALLBACK_DLQ,
  CALLBACK_QUEUE,
  EMAIL_QUEUE,
  GENERATION_DLQ,
  GENERATION_QUEUE,
} from './queue.constants';

function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
  };
}

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: parseRedisUrl(config.get<string>('redis.url') ?? 'redis://localhost:6379'),
      }),
    }),
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
    BullModule.registerQueue({ name: GENERATION_QUEUE }),
    BullModule.registerQueue({ name: CALLBACK_QUEUE }),
    BullModule.registerQueue({ name: GENERATION_DLQ }),
    BullModule.registerQueue({ name: CALLBACK_DLQ }),
  ],
  exports: [BullModule],
})
export class BullMqModule {}
