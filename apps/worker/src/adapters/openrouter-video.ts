import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  AdapterError,
  type AdapterContext,
  type AdapterFile,
  type AdapterResult,
  type ProviderAdapter,
} from './types';
import type { WorkerStorage } from '../storage/storage';

// OpenRouter unified video-generation endpoint mirror for the worker.
// Keep in sync with apps/api/src/modules/providers/adapters/openrouter-video.adapter.ts.
const SUPPORTED_MODELS = new Set([
  'openrouter-seedance-2-0',
  'openrouter-seedance-2-0-fast',
  'openrouter-seedance-1-5-pro',
]);
const SUPPORTED_METHODS = new Set(['text_to_video', 'image_to_video']);

const MODEL_CODE_TO_API_NAME: Record<string, string> = {
  'openrouter-seedance-2-0': 'bytedance/seedance-2.0',
  'openrouter-seedance-2-0-fast': 'bytedance/seedance-2.0-fast',
  'openrouter-seedance-1-5-pro': 'bytedance/seedance-1-5-pro',
};

const MODELS_WITHOUT_1080P = new Set(['openrouter-seedance-2-0-fast']);

function realModelName(code: string): string {
  return MODEL_CODE_TO_API_NAME[code] ?? code;
}

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

interface OpenRouterVideoResponse {
  id?: string;
  polling_url?: string;
  status?: 'pending' | 'in_progress' | 'processing' | 'completed' | 'succeeded' | 'failed' | 'cancelled';
  unsigned_urls?: string[];
  signed_urls?: string[];
  error?: { code?: string; message?: string } | string;
  message?: string;
}

function pickString(p: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function pickDuration(p: Record<string, unknown>): number {
  const candidates = [p['duration_seconds'], p['durationSeconds'], p['duration']];
  for (const c of candidates) {
    if (typeof c === 'number' && c >= 4 && c <= 15) return c;
    if (typeof c === 'string') {
      const n = Number(c);
      if (Number.isFinite(n) && n >= 4 && n <= 15) return n;
    }
  }
  return 5;
}

function pickResolution(p: Record<string, unknown>, modelCode: string): string {
  const v = pickString(p, 'resolution');
  if (v === '480p' || v === '720p' || v === '1080p') {
    if (v === '1080p' && MODELS_WITHOUT_1080P.has(modelCode)) return '720p';
    return v;
  }
  return '720p';
}

function pickAspect(p: Record<string, unknown>): string {
  const v = pickString(p, 'aspect_ratio', 'aspectRatio', 'ratio');
  if (v && /^\d+:\d+$/.test(v)) return v;
  return '16:9';
}

function errorMessageFrom(body: OpenRouterVideoResponse): string {
  if (typeof body.error === 'string') return body.error;
  if (body.error && typeof body.error === 'object') {
    return body.error.message ?? body.error.code ?? 'unknown error';
  }
  if (body.message) return body.message;
  return 'unknown error';
}

function classifyOpenRouterError(
  status: number,
  body: OpenRouterVideoResponse,
  retryAfter?: string | null,
): AdapterError {
  const msg = errorMessageFrom(body) || `openrouter error status=${status}`;
  const code =
    typeof body.error === 'object' && body.error?.code ? body.error.code : '';
  if (status === 401 || status === 403) {
    return new AdapterError('invalid_credentials', msg);
  }
  if (status === 429 || /rate/i.test(msg)) {
    const retryMs = retryAfter ? Number(retryAfter) * 1000 : undefined;
    return new AdapterError('rate_limit', msg, retryMs);
  }
  if (status >= 500) return new AdapterError('temporary', msg);
  if (/quota|exhaust/i.test(code) || /quota|exhaust/i.test(msg)) {
    return new AdapterError('quota', msg);
  }
  if (
    /billing|balance|credit|insufficient|payment/i.test(code) ||
    /billing|balance|insufficient|payment/i.test(msg)
  ) {
    return new AdapterError('billing', msg);
  }
  if (/sensitive|content.?policy|moderation|safety|prohibit/i.test(code + ' ' + msg)) {
    return new AdapterError('content_rejected', msg);
  }
  if (/invalid/i.test(code) || /invalid|unsupported|required/i.test(msg)) {
    return new AdapterError('validation', msg);
  }
  return new AdapterError('unknown', msg);
}

export class OpenRouterVideoAdapter implements ProviderAdapter {
  // OpenRouter is used as a transparent routing layer for the Seedance 2.0
  // family; from the public catalog's perspective these models belong to
  // the `seedance` provider. The registry resolves between this adapter
  // and the BytePlus-direct SeedanceAdapter via the model-code allow-list
  // (`SUPPORTED_MODELS` — only the `openrouter-seedance-*` slugs land here).
  public readonly providerCode = 'seedance';

  constructor(private readonly storage: WorkerStorage) {}

  supports(modelCode: string, methodCode: string): boolean {
    if (!SUPPORTED_MODELS.has(modelCode)) return false;
    if (!SUPPORTED_METHODS.has(methodCode)) return false;
    return true;
  }

  async execute(ctx: AdapterContext): Promise<AdapterResult> {
    const apiKey = this.extractApiKey(ctx);
    const agent = this.buildProxyAgent(ctx);
    const { method, model, params } = ctx;
    const prompt = pickString(params, 'prompt') ?? '';

    const isImageToVideo = method.code === 'image_to_video';
    if (!isImageToVideo && !prompt) {
      throw new AdapterError(
        'validation',
        'text_to_video requires "prompt" parameter',
      );
    }

    const body: Record<string, unknown> = {
      model: realModelName(model.code),
      prompt,
      duration: pickDuration(params),
      resolution: pickResolution(params, model.code),
      aspect_ratio: pickAspect(params),
    };

    if (isImageToVideo) {
      const image = pickString(
        params,
        'image',
        'source_image',
        'input_image',
        'input_image_url',
      );
      if (!image) {
        throw new AdapterError(
          'validation',
          'image_to_video requires "image" parameter (URL or data: URI)',
        );
      }
      body.frame_images = [
        {
          type: 'image_url',
          image_url: { url: image },
          frame_type: 'first_frame',
        },
      ];
    }

    const parsed = await this.callApi(
      'POST',
      `${OPENROUTER_BASE}/videos`,
      apiKey,
      body,
      agent,
    );
    const taskId = parsed.id;
    if (!taskId) {
      throw new AdapterError(
        'unknown',
        `openrouter submit returned no task id: ${JSON.stringify(parsed).slice(0, 300)}`,
      );
    }
    return { pending: true, providerJobId: taskId };
  }

  async pollOperation(
    ctx: AdapterContext,
    providerJobId: string,
  ): Promise<AdapterResult> {
    const apiKey = this.extractApiKey(ctx);
    const agent = this.buildProxyAgent(ctx);
    const url = `${OPENROUTER_BASE}/videos/${encodeURIComponent(providerJobId)}`;
    const parsed = await this.callApi('GET', url, apiKey, undefined, agent);

    const status = parsed.status;
    if (
      status === 'pending' ||
      status === 'in_progress' ||
      status === 'processing'
    ) {
      return { pending: true, providerJobId };
    }
    if (status === 'failed' || status === 'cancelled') {
      throw classifyOpenRouterError(200, parsed, null);
    }
    if (status === 'completed' || status === 'succeeded') {
      const urls = parsed.signed_urls ?? parsed.unsigned_urls ?? [];
      const firstUrl = urls[0];
      if (!firstUrl) {
        throw new AdapterError(
          'unknown',
          'openrouter task completed but no video URL',
        );
      }
      const needsAuth = !parsed.signed_urls || parsed.signed_urls.length === 0;
      const downloaded = await this.downloadVideo(
        firstUrl,
        needsAuth ? apiKey : undefined,
        agent,
      );
      const key = this.storage.buildKey({
        userId: ctx.userId,
        taskId: ctx.taskId,
        filename: 'video_0.mp4',
      });
      const uploaded = await this.storage.upload({
        key,
        body: downloaded.body,
        contentType: downloaded.mimeType,
      });
      const file: AdapterFile = {
        url: uploaded.url,
        mimeType: downloaded.mimeType,
        bucket: uploaded.bucket,
        key: uploaded.key,
        size: uploaded.size,
        fileType: 'video',
        durationSeconds: pickDuration(ctx.params),
      };
      return { files: [file], pending: false };
    }
    return { pending: true, providerJobId };
  }

  private extractApiKey(ctx: AdapterContext): string {
    const c = ctx.account.credentials ?? {};
    const v =
      (c['apiKey'] as string | undefined) ??
      (c['api_key'] as string | undefined) ??
      (c['key'] as string | undefined) ??
      (c['openrouterApiKey'] as string | undefined) ??
      (c['openrouter_api_key'] as string | undefined);
    if (typeof v !== 'string' || v.length === 0) {
      throw new AdapterError(
        'invalid_credentials',
        'openrouter account credentials missing apiKey',
      );
    }
    return v;
  }

  private buildProxyAgent(ctx: AdapterContext): HttpsProxyAgent<string> | undefined {
    if (!ctx.proxy) return undefined;
    const { protocol, host, port, login, password } = ctx.proxy;
    const scheme =
      protocol === 'SOCKS5' ? 'socks5' : protocol === 'HTTPS' ? 'https' : 'http';
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
    httpMethod: 'GET' | 'POST',
    url: string,
    apiKey: string,
    body: unknown,
    agent: HttpsProxyAgent<string> | undefined,
  ): Promise<OpenRouterVideoResponse> {
    let res: Response;
    try {
      const init: RequestInit & { agent?: unknown } = {
        method: httpMethod,
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
      };
      if (httpMethod === 'POST' && body !== undefined) {
        init.body = JSON.stringify(body);
      }
      if (agent) init.agent = agent;
      res = await fetch(url, init);
    } catch (err) {
      throw new AdapterError(
        'temporary',
        `network error calling openrouter: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const text = await res.text();
    let parsed: OpenRouterVideoResponse = {};
    try {
      parsed = text ? (JSON.parse(text) as OpenRouterVideoResponse) : {};
    } catch {
      parsed = {};
    }
    if (!res.ok) {
      throw classifyOpenRouterError(res.status, parsed, res.headers.get('retry-after'));
    }
    return parsed;
  }

  private async downloadVideo(
    url: string,
    apiKey: string | undefined,
    agent: HttpsProxyAgent<string> | undefined,
  ): Promise<{ body: Buffer; mimeType: string }> {
    const init: RequestInit & { agent?: unknown } = { method: 'GET' };
    if (apiKey) {
      init.headers = { authorization: `Bearer ${apiKey}` };
    }
    if (agent) init.agent = agent;
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new AdapterError(
        'temporary',
        `failed to download openrouter video: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!res.ok) {
      throw new AdapterError(
        'temporary',
        `failed to download openrouter video: status=${res.status}`,
      );
    }
    const mimeType = res.headers.get('content-type') ?? 'video/mp4';
    const buf = Buffer.from(await res.arrayBuffer());
    return { body: buf, mimeType };
  }
}
