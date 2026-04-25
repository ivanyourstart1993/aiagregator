import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PricingCacheService } from './pricing-cache.service';

export const PricingEvents = {
  InvalidateAll: 'pricing.invalidate.all',
  InvalidateUser: 'pricing.invalidate.user',
  InvalidateUserBundle: 'pricing.invalidate.userBundle',
} as const;

export interface InvalidateUserEvent {
  userId: string;
}

export interface InvalidateUserBundleEvent {
  userId: string;
  bundleKey: string;
}

@Injectable()
export class PricingCacheInvalidator {
  private readonly logger = new Logger(PricingCacheInvalidator.name);

  constructor(private readonly cache: PricingCacheService) {}

  @OnEvent(PricingEvents.InvalidateAll)
  async onInvalidateAll(): Promise<void> {
    const n = await this.cache.flushAll();
    this.logger.debug(`pricing cache: flushed ${n} keys (all)`);
  }

  @OnEvent(PricingEvents.InvalidateUser)
  async onInvalidateUser(payload: InvalidateUserEvent): Promise<void> {
    if (!payload?.userId) return;
    const n = await this.cache.flushUser(payload.userId);
    this.logger.debug(`pricing cache: flushed ${n} keys (user=${payload.userId})`);
  }

  @OnEvent(PricingEvents.InvalidateUserBundle)
  async onInvalidateUserBundle(payload: InvalidateUserBundleEvent): Promise<void> {
    if (!payload?.userId || !payload?.bundleKey) return;
    const n = await this.cache.flushUserBundle(payload.userId, payload.bundleKey);
    this.logger.debug(
      `pricing cache: flushed ${n} keys (user=${payload.userId} bundle=${payload.bundleKey})`,
    );
  }
}
