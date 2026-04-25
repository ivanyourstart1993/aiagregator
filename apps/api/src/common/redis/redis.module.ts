import { Global, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis, { type Redis } from 'ioredis';

export const IOREDIS_CLIENT = Symbol('IOREDIS_CLIENT');

class RedisLifecycle implements OnModuleDestroy {
  constructor(private readonly client: Redis) {}
  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: IOREDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const url = config.get<string>('redis.url') ?? 'redis://localhost:6379';
        const logger = new Logger('Redis');
        const client = new IORedis(url, {
          maxRetriesPerRequest: null,
          lazyConnect: false,
        });
        client.on('error', (err) => {
          logger.warn(`Redis error: ${err.message}`);
        });
        return client;
      },
    },
    {
      provide: RedisLifecycle,
      inject: [IOREDIS_CLIENT],
      useFactory: (client: Redis): RedisLifecycle => new RedisLifecycle(client),
    },
  ],
  exports: [IOREDIS_CLIENT],
})
export class RedisModule {}
