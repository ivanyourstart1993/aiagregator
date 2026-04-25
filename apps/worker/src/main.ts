// Worker entry point. Stage 6 wires the stub-generation processor; real
// provider adapters (Banana, Veo, Kling) will be added in Stages 7-9.
import { PrismaClient } from '@aiagg/db';
import { createStubGenerationWorker } from './processors/stub-generation.processor';

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const prisma = new PrismaClient();
  await prisma.$connect();

  const handle = createStubGenerationWorker({ redisUrl, prisma });
  console.log('[worker] stub-generation processor started');

  const shutdown = async (): Promise<void> => {
    console.log('[worker] shutting down...');
    try {
      await handle.close();
    } catch {
      /* swallow */
    }
    try {
      await prisma.$disconnect();
    } catch {
      /* swallow */
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error('[worker] fatal error', err);
  process.exit(1);
});
