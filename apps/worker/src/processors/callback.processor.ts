// Callback dispatch worker (Stage 10).
// Posts a signed webhook payload to apiRequest.callbackUrl when a Task
// finalises (success or failure). Each delivery attempt is recorded in
// WebhookDelivery. BullMQ handles retries; exhausted jobs are moved to
// the callback-dead-letter queue by the worker.failed listener.
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { createHmac } from 'node:crypto';
import {
  TaskStatus,
  WebhookDeliveryStatus,
  type Prisma,
  type PrismaClient,
} from '@aiagg/db';

const QUEUE = 'callback';
const DLQ = 'callback-dead-letter';
const CONNECT_TIMEOUT_MS = 10_000;
const TOTAL_TIMEOUT_MS = 30_000;

interface JobData {
  apiRequestId: string;
}

function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  const isTls = u.protocol === 'rediss:';
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    ...(isTls ? { tls: {} } : {}),
  };
}

export interface CallbackProcessorHandle {
  worker: Worker<JobData>;
  close: () => Promise<void>;
}

interface ResultFileLite {
  fileUrl: string;
  mimeType: string;
  fileType: string;
  expiresAt: Date;
}

function buildResultPayload(files: ResultFileLite[]): unknown | null {
  if (files.length === 0) return null;
  const f = files[0];
  return {
    type: f.fileType,
    url: f.fileUrl,
    mime_type: f.mimeType,
    available_until: f.expiresAt.toISOString(),
    files: files.map((x) => ({
      type: x.fileType,
      url: x.fileUrl,
      mime_type: x.mimeType,
      available_until: x.expiresAt.toISOString(),
    })),
  };
}

async function postWithTimeout(
  url: string,
  body: string,
  signature: string,
  taskId: string,
): Promise<{ status: number; text: string }> {
  // AbortController for total timeout. Connection timeout is approximated by
  // the same controller — Node's fetch does not split connect/total; for
  // strict separation the user can deploy behind undici with custom
  // `connect: { timeout }`. For MVP we use the total budget.
  const controller = new AbortController();
  const total = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);
  void CONNECT_TIMEOUT_MS;
  try {
    const res = await fetch(url, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-Aggregator-Signature': `sha256=${signature}`,
        'X-Aggregator-Event': 'generation.completed',
        'X-Aggregator-Task-Id': taskId,
        'User-Agent': 'aiagg-webhook/1.0',
      },
      signal: controller.signal,
    });
    let text = '';
    try {
      text = await res.text();
    } catch {
      /* swallow body read errors */
    }
    return { status: res.status, text: text.slice(0, 4000) };
  } finally {
    clearTimeout(total);
  }
}

export function createCallbackWorker(opts: {
  redisUrl: string;
  prisma: PrismaClient;
  webhookSecret: string;
  maxAttempts: number;
}): CallbackProcessorHandle {
  const connection = parseRedisUrl(opts.redisUrl);
  const { prisma, webhookSecret, maxAttempts } = opts;
  const dlq = new Queue(DLQ, { connection });

  const worker = new Worker<JobData>(
    QUEUE,
    async (job) => {
      const { apiRequestId } = job.data;
      const apiRequest = await prisma.apiRequest.findUnique({
        where: { id: apiRequestId },
        include: {
          task: true,
        },
      });
      if (!apiRequest || !apiRequest.callbackUrl || !apiRequest.task) return;

      const task = apiRequest.task;
      const method = await prisma.method.findUnique({
        where: { id: apiRequest.methodId },
        include: { provider: true, model: true },
      });

      const files = await prisma.resultFile.findMany({
        where: { taskId: task.id },
        orderBy: { createdAt: 'asc' },
        select: {
          fileUrl: true,
          mimeType: true,
          fileType: true,
          expiresAt: true,
        },
      });

      const payload = {
        event: 'generation.completed',
        task_id: task.id,
        status: task.status.toLowerCase(),
        provider: method?.provider.code ?? null,
        model: method?.model.code ?? null,
        method: method?.code ?? null,
        charged_amount: apiRequest.clientPriceUnits.toString(),
        currency: 'USD',
        result:
          task.status === TaskStatus.SUCCEEDED
            ? buildResultPayload(files)
            : null,
        error:
          task.status === TaskStatus.FAILED || task.status === TaskStatus.CANCELLED
            ? {
                code: task.errorCode ?? apiRequest.errorCode ?? 'unknown_error',
                message:
                  task.errorMessage ??
                  apiRequest.errorMessage ??
                  'Task did not complete successfully',
              }
            : null,
      };

      // Stage 16 — per-ApiKey webhook secret takes precedence over the
      // global env fallback. The plaintext is stored alongside the key.
      let signingSecret = webhookSecret;
      if (apiRequest.apiKeyId) {
        try {
          const apiKey = await prisma.apiKey.findUnique({
            where: { id: apiRequest.apiKeyId },
            select: { webhookSecret: true },
          });
          if (apiKey?.webhookSecret) signingSecret = apiKey.webhookSecret;
        } catch {
          /* swallow — fall back to global */
        }
      }

      const rawBody = JSON.stringify(payload);
      const signature = createHmac('sha256', signingSecret)
        .update(rawBody)
        .digest('hex');

      const attempt = (job.attemptsMade ?? 0) + 1;
      const delivery = await prisma.webhookDelivery.create({
        data: {
          apiRequestId: apiRequest.id,
          taskId: task.id,
          url: apiRequest.callbackUrl,
          attempt,
          status: WebhookDeliveryStatus.PENDING,
          signature,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });

      try {
        const { status, text } = await postWithTimeout(
          apiRequest.callbackUrl,
          rawBody,
          signature,
          task.id,
        );
        const ok = status >= 200 && status < 300;
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: ok
              ? WebhookDeliveryStatus.SUCCESS
              : WebhookDeliveryStatus.FAILED,
            responseStatus: status,
            responseBody: text || null,
            finishedAt: new Date(),
          },
        });
        if (!ok) {
          throw new Error(`callback non-2xx status=${status}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.webhookDelivery
          .update({
            where: { id: delivery.id },
            data: {
              status: WebhookDeliveryStatus.FAILED,
              errorMessage: message.slice(0, 4000),
              finishedAt: new Date(),
            },
          })
          .catch(() => undefined);
        throw err;
      }
    },
    { connection, concurrency: 10 },
  );

  worker.on('failed', (job, err) => {
    if (!job) return;
    const attemptsMade = job.attemptsMade ?? 0;
    if (attemptsMade >= maxAttempts) {
      dlq
        .add('callback-dlq', job.data, {
          removeOnComplete: 1000,
          removeOnFail: 5000,
          attempts: 1,
        })
        .catch(() => undefined);
      console.warn(
        `[callback-worker] job ${job.id} exhausted ${attemptsMade} attempts, moved to DLQ: ${err.message}`,
      );
    }
  });

  return {
    worker,
    close: async () => {
      await worker.close();
      await dlq.close();
    },
  };
}
