import type { PrismaClient } from '@aiagg/db';

/**
 * Prisma's interactive transaction client — same surface as PrismaClient minus
 * connection lifecycle and query-engine-level helpers that are unavailable
 * inside an open transaction.
 */
export type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
