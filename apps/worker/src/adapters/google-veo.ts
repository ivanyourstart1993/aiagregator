// Worker-side Google Veo adapter. Submits the LRO via predictLongRunning and
// returns `{ pending: true, providerJobId }` so the worker stores the
// operation name on the Task and exits the BullMQ job. The API-side
// PollLroCron then polls and finalises the result.
//
// The worker process never polls itself in this design — keeps it simple
// and avoids duplicate polling between the worker and the API cron.
import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  AdapterError,
  type AdapterContext,
  type AdapterResult,
  type ProviderAdapter,
} from './types';
import type { WorkerStorage } from '../storage/storage';

const SUPPORTED_MODELS = new Set([
  'veo-3.0-generate-001',
  'veo-3.0-fast-generate-001',
  'veo-3.1-generate-preview',
  'veo-3.1-fast-generate-preview',
  'veo-3.1-lite-generate-preview',
]);

const SUPPORTED_METHODS = new Set([
  'text_to_video',
  'image_to_video',
  'video_extend',
  'first_last_frame_to_video',
  'video_to_video',
]);

interface VeoOperation {
  name?: string;
  done?: boolean;
  error?: { code?: number; message?: string; status?: string };
}

interface VeoErrorBody {
  error?: { code?: number; message?: string; status?: string };
}

function pickString(p: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function pickInt(p: Record<string, unknown>, def: number, ...keys: string[]): number {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      return Math.trunc(v);
    }
  }
  return def;
}

async function fetchAsBase64(
  url: string,
  agent?: HttpsProxyAgent<string>,
): Promise<{ data: string; mimeType: string }> {
  const init: RequestInit & { agent?: unknown } = {};
  if (agent) init.agent = agent;
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new AdapterError(
      'validation',
      `failed to fetch source media (${res.status}): ${url}`,
    );
  }
  const ct = res.headers.get('content-type') ?? 'application/octet-stream';
  const buf = Buffer.from(await res.arrayBuffer());
  return { data: buf.toString('base64'), mimeType: ct };
}

async function readMaybeBase64(
  v: unknown,
  agent?: HttpsProxyAgent<string>,
): Promise<{ data: string; mimeType: string } | null> {
  if (typeof v !== 'string' || v.length === 0) return null;
  if (v.startsWith('data:')) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(v);
    if (m) return { mimeType: m[1]!, data: m[2]! };
    return null;
  }
  if (/^https?:\/\//.test(v)) return await fetchAsBase64(v, agent);
  return null;
}

export class GoogleVeoAdapter implements ProviderAdapter {
  public readonly providerCode = 'google_veo';

  // storage is unused in the worker (no upload happens here — only LRO submit),
  // but kept on the constructor for symmetry with other adapters.
  constructor(_storage: WorkerStorage) {}

  supports(modelCode: string, methodCode: string): boolean {
    return SUPPORTED_MODELS.has(modelCode) && SUPPORTED_METHODS.has(methodCode);
  }

  async execute(ctx: AdapterContext): Promise<AdapterResult> {
    const apiKey = this.extractApiKey(ctx);
    if (!apiKey) {
      throw new AdapterError(
        'invalid_credentials',
        'google_veo account credentials missing apiKey',
      );
    }
    const { method, model, params } = ctx;
    const agent = this.buildProxyAgent(ctx);

    const prompt = pickString(params, 'prompt') ?? '';
    const aspect = pickString(params, 'aspect_ratio', 'aspectRatio');
    const resolution = pickString(params, 'resolution') ?? '1080p';
    const duration = pickInt(params, 8, 'duration_seconds', 'durationSeconds');
    const sampleCount = pickInt(params, 1, 'videos_count', 'videosCount', 'sampleCount');

    const instance: Record<string, unknown> = {};
    if (prompt) instance.prompt = prompt;

    if (method.code === 'image_to_video') {
      const imgVal =
        params['input_image_url'] ??
        params['image'] ??
        params['source_image'] ??
        params['input_image'];
      const inline = await readMaybeBase64(imgVal, agent);
      if (!inline) {
        throw new AdapterError(
          'validation',
          'image_to_video requires input_image_url (https or data: URL)',
        );
      }
      instance.image = {
        bytesBase64Encoded: inline.data,
        mimeType: inline.mimeType,
      };
    } else if (
      method.code === 'first_last_frame_to_video' ||
      method.code === 'video_extend' ||
      method.code === 'video_to_video'
    ) {
      const first = await readMaybeBase64(params['first_frame_url'], agent);
      const last = await readMaybeBase64(params['last_frame_url'], agent);
      const video = await readMaybeBase64(params['input_video_url'], agent);
      if (first) instance.firstFrame = { bytesBase64Encoded: first.data, mimeType: first.mimeType };
      if (last) instance.lastFrame = { bytesBase64Encoded: last.data, mimeType: last.mimeType };
      if (video) instance.video = { bytesBase64Encoded: video.data, mimeType: video.mimeType };
    }

    const parameters: Record<string, unknown> = {
      durationSeconds: duration,
      resolution,
      sampleCount,
    };
    if (aspect) parameters.aspectRatio = aspect;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.code)}:predictLongRunning?key=${encodeURIComponent(apiKey)}`;
    const body = { instances: [instance], parameters };

    const op = await this.callApi(url, 'POST', body, agent);
    if (!op.name) {
      throw new AdapterError(
        'unknown',
        'google_veo: predictLongRunning returned no operation name',
      );
    }
    return {
      pending: true,
      providerJobId: op.name,
      meta: {
        durationSeconds: duration,
        resolution,
        sampleCount,
        aspectRatio: aspect ?? null,
      },
    };
  }

  private extractApiKey(ctx: AdapterContext): string | null {
    const c = ctx.account.credentials ?? {};
    const v =
      (c['apiKey'] as string | undefined) ??
      (c['api_key'] as string | undefined) ??
      (c['key'] as string | undefined);
    return typeof v === 'string' && v.length > 0 ? v : null;
  }

  private buildProxyAgent(
    ctx: AdapterContext,
  ): HttpsProxyAgent<string> | undefined {
    if (!ctx.proxy) return undefined;
    const { protocol, host, port, login, password } = ctx.proxy;
    const scheme =
      protocol === 'SOCKS5'
        ? 'socks5'
        : protocol === 'HTTPS'
          ? 'https'
          : 'http';
    const auth =
      login && password
        ? `${encodeURIComponent(login)}:${encodeURIComponent(password)}@`
        : '';
    try {
      return new HttpsProxyAgent(`${scheme}://${auth}${host}:${port}`);
    } catch {
      return undefined;
    }
  }

  private async callApi(
    url: string,
    httpMethod: 'GET' | 'POST',
    body: unknown,
    agent: HttpsProxyAgent<string> | undefined,
  ): Promise<VeoOperation> {
    let res: Response;
    try {
      const init: RequestInit & { agent?: unknown } = {
        method: httpMethod,
        headers: { 'content-type': 'application/json' },
      };
      if (httpMethod === 'POST') init.body = JSON.stringify(body ?? {});
      if (agent) init.agent = agent;
      res = await fetch(url, init);
    } catch (err) {
      throw new AdapterError(
        'temporary',
        `network error calling google_veo: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const text = await res.text();
    let parsed: VeoOperation & VeoErrorBody;
    try {
      parsed = text ? (JSON.parse(text) as VeoOperation & VeoErrorBody) : {};
    } catch {
      parsed = {} as VeoOperation;
    }
    if (!res.ok) {
      const status = res.status;
      const message =
        parsed.error?.message ??
        `google_veo returned status ${status}: ${text.slice(0, 500)}`;
      const code = parsed.error?.status ?? '';
      if (status === 401 || status === 403) {
        throw new AdapterError('invalid_credentials', message);
      }
      if (status === 429) {
        const retry = res.headers.get('retry-after');
        const retryMs = retry ? Number(retry) * 1000 : undefined;
        throw new AdapterError('rate_limit', message, retryMs);
      }
      if (
        status === 400 &&
        (code === 'RESOURCE_EXHAUSTED' || /quota/i.test(message))
      ) {
        throw new AdapterError('quota', message);
      }
      if (status === 400) {
        throw new AdapterError('validation', message);
      }
      if (status >= 500) {
        throw new AdapterError('temporary', message);
      }
      throw new AdapterError('unknown', message);
    }
    return parsed;
  }
}
