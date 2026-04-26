// Worker entry point. Stage 7 wires the real generation processor with the
// Google Banana adapter. Stages 8/9 will plug Veo and Kling adapters into
// the same registry.
import { PrismaClient } from '@aiagg/db';
import { createGenerationWorker } from './processors/generation.processor';
import { createCallbackWorker } from './processors/callback.processor';
import { WorkerAdapterRegistry } from './adapters/registry';
import { WorkerStorage } from './storage/storage';

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const prisma = new PrismaClient();
  await prisma.$connect();

  const storage = WorkerStorage.fromEnv();
  // Best-effort bucket bootstrap. Don't crash the worker if MinIO isn't ready
  // yet — adapter calls will retry on first use.
  try {
    await storage.ensureBucket();
  } catch (err) {
    console.warn(
      `[worker] storage init warning: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const registry = new WorkerAdapterRegistry(storage);

  const handle = createGenerationWorker({
    redisUrl,
    prisma,
    storage,
    registry,
  });
  console.log('[worker] generation processor started (Stage 7)');

  const callbackHandle = createCallbackWorker({
    redisUrl,
    prisma,
    webhookSecret: process.env.WEBHOOK_SECRET ?? 'dev-webhook-secret-change-me',
    maxAttempts: Number(process.env.CALLBACK_MAX_ATTEMPTS ?? 5),
  });
  console.log('[worker] callback processor started (Stage 10)');

  const shutdown = async (): Promise<void> => {
    console.log('[worker] shutting down...');
    try {
      await handle.close();
    } catch {
      /* swallow */
    }
    try {
      await callbackHandle.close();
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
