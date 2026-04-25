import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { IOREDIS_CLIENT } from '../../common/redis/redis.module';
import type { ResolvedPriceView } from './dto/views';

const PREFIX = 'pricing:v1';
const TTL_SECONDS = 60;

interface SerializedResolved {
  source: string;
  sourceRefId: string;
  currency: string;
  components: {
    basePriceUnits: string | null;
    inputPerTokenUnits: string | null;
    outputPerTokenUnits: string | null;
    perSecondUnits: string | null;
    perImageUnits: string | null;
  };
  bundle: ResolvedPriceView['bundle'];
}

function bigintOrNull(v: bigint | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return v.toString();
}

function parseBig(v: string | null): bigint | null {
  if (v === null || v === undefined) return null;
  return BigInt(v);
}

@Injectable()
export class PricingCacheService {
  private readonly logger = new Logger(PricingCacheService.name);

  constructor(@Inject(IOREDIS_CLIENT) private readonly redis: Redis) {}

  key(userId: string, bundleKey: string): string {
    return `${PREFIX}:${userId}:${bundleKey}`;
  }

  async get(
    userId: string,
    bundleKey: string,
  ): Promise<Omit<ResolvedPriceView, 'pricingSnapshotId'> | null> {
    try {
      const raw = await this.redis.get(this.key(userId, bundleKey));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SerializedResolved;
      return {
        source: parsed.source as ResolvedPriceView['source'],
        sourceRefId: parsed.sourceRefId,
        currency: parsed.currency as ResolvedPriceView['currency'],
        components: {
          basePriceUnits: parseBig(parsed.components.basePriceUnits),
          inputPerTokenUnits: parseBig(parsed.components.inputPerTokenUnits),
          outputPerTokenUnits: parseBig(parsed.components.outputPerTokenUnits),
          perSecondUnits: parseBig(parsed.components.perSecondUnits),
          perImageUnits: parseBig(parsed.components.perImageUnits),
        },
        bundle: parsed.bundle,
      };
    } catch (err) {
      this.logger.warn(
        `pricing cache get failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  async set(
    userId: string,
    bundleKey: string,
    value: Omit<ResolvedPriceView, 'pricingSnapshotId'>,
  ): Promise<void> {
    try {
      const payload: SerializedResolved = {
        source: value.source,
        sourceRefId: value.sourceRefId,
        currency: value.currency,
        components: {
          basePriceUnits: bigintOrNull(value.components.basePriceUnits),
          inputPerTokenUnits: bigintOrNull(value.components.inputPerTokenUnits),
          outputPerTokenUnits: bigintOrNull(value.components.outputPerTokenUnits),
          perSecondUnits: bigintOrNull(value.components.perSecondUnits),
          perImageUnits: bigintOrNull(value.components.perImageUnits),
        },
        bundle: value.bundle,
      };
      await this.redis.set(
        this.key(userId, bundleKey),
        JSON.stringify(payload),
        'EX',
        TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(
        `pricing cache set failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Flush all entries matching `pricing:v1:*` via SCAN+DEL (never FLUSHDB). */
  async flushAll(): Promise<number> {
    return this.scanAndDelete(`${PREFIX}:*`);
  }

  /** Flush all entries for a specific user: `pricing:v1:<userId>:*`. */
  async flushUser(userId: string): Promise<number> {
    return this.scanAndDelete(`${PREFIX}:${userId}:*`);
  }

  /** Flush a single specific user/bundle. */
  async flushUserBundle(userId: string, bundleKey: string): Promise<number> {
    try {
      return await this.redis.del(this.key(userId, bundleKey));
    } catch (err) {
      this.logger.warn(
        `pricing cache flushUserBundle failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }
  }

  private async scanAndDelete(pattern: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;
    try {
      do {
        const [next, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          200,
        );
        cursor = next;
        if (keys.length > 0) {
          deleted += await this.redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(
        `pricing cache scanAndDelete(${pattern}) failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return deleted;
  }
}
