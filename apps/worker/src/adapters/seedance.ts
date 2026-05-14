import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  AdapterError,
  type AdapterContext,
  type AdapterFile,
  type AdapterResult,
  type ProviderAdapter,
} from './types';
import type { WorkerStorage } from '../storage/storage';

const SUPPORTED_MODELS = new Set([
  'doubao-seedance-1-0-pro-250528',
  'doubao-seedance-1-0-lite-t2v-250428',
  'doubao-seedance-1-0-lite-i2v-250428',
]);
const T2V_ONLY = new Set(['doubao-seedance-1-0-lite-t2v-250428']);
const I2V_ONLY = new Set(['doubao-seedance-1-0-lite-i2v-250428']);
const SUPPORTED_METHODS = new Set(['text_to_video', 'image_to_video']);

// Catalog slugs carry the `doubao-` prefix (consistent with Volcano Engine
// CN's full model IDs), but the BytePlus ModelArk Singapore endpoint —
// which is the default we hit — registers them without it. Map at the
// adapter boundary so the catalog can keep canonical names and we still
// pass the right `model` field to the public API.
const MODEL_CODE_TO_API_NAME: Record<string, string> = {
  'doubao-seedance-1-0-pro-250528': 'seedance-1-0-pro-250528',
  'doubao-seedance-1-0-lite-t2v-250428': 'seedance-1-0-lite-t2v-250428',
  'doubao-seedance-1-0-lite-i2v-250428': 'seedance-1-0-lite-i2v-250428',
};
function realModelName(code: string): string {
  return MODEL_CODE_TO_API_NAME[code] ?? code;
}

// BytePlus ModelArk (Singapore) is the international entrypoint and the
// default — accessible from EU/US without proxy. Volcano Engine CN can be
// supplied per-account via `credentials.baseUrl`.
const SEEDANCE_DEFAULT_BASE = 'https://ark.ap-southeast.bytepluses.com/api/v3';

function resolveBaseUrl(c: Record<string, unknown> | undefined): string {
  if (!c) return SEEDANCE_DEFAULT_BASE;
  const v =
    (c['baseUrl'] as string | undefined) ??
    (c['base_url'] as string | undefined);
  if (typeof v === 'string' && v.length > 0) return v.replace(/\/+$/, '');
  return SEEDANCE_DEFAULT_BASE;
}

interface SeedanceTaskResponse {
  id?: string;
  model?: string;
  status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  content?: { video_url?: string };
  error?: { code?: string; message?: string };
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
    if (typeof c === 'number' && (c === 5 || c === 10)) return c;
    if (typeof c === 'string') {
      const n = Number(c);
      if (n === 5 || n === 10) return n;
    }
  }
  return 5;
}

function pickResolution(p: Record<string, unknown>): string {
  const v = pickString(p, 'resolution');
  if (v === '480p' || v === '720p' || v === '1080p') return v;
  return '720p';
}

function pickAspect(p: Record<string, unknown>): string {
  const v = pickString(p, 'aspect_ratio', 'aspectRatio', 'ratio');
  if (v && /^\d+:\d+$/.test(v)) return v;
  return '16:9';
}

function buildParamSwitches(p: Record<string, unknown>): string {
  const parts = [
    `--resolution ${pickResolution(p)}`,
    `--ratio ${pickAspect(p)}`,
    `--duration ${pickDuration(p)}`,
  ];
  return parts.join(' ');
}

function classifySeedanceError(
  status: number,
  body: SeedanceTaskResponse,
  retryAfter?: string | null,
): AdapterError {
  const code = body.error?.code ?? '';
  const msg = body.error?.message ?? `seedance error status=${status}`;
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
  if (/billing|balance|credit/i.test(code) || /billing|balance|insufficient/i.test(msg)) {
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

export class SeedanceAdapter implements ProviderAdapter {
  public readonly providerCode = 'seedance';

  constructor(private readonly storage: WorkerStorage) {}

  supports(modelCode: string, methodCode: string): boolean {
    if (!SUPPORTED_MODELS.has(modelCode)) return false;
    if (!SUPPORTED_METHODS.has(methodCode)) return false;
    if (methodCode === 'text_to_video' && I2V_ONLY.has(modelCode)) return false;
    if (methodCode === 'image_to_video' && T2V_ONLY.has(modelCode)) return false;
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

    const switches = buildParamSwitches(params);
    const textWithSwitches = prompt ? `${prompt} ${switches}` : switches;

    const content: Array<Record<string, unknown>> = [];
    if (isImageToVideo) {
      const image = pickString(params, 'image', 'source_image', 'input_image', 'input_image_url');
      if (!image) {
        throw new AdapterError(
          'validation',
          'image_to_video requires "image" parameter (URL or data: URI)',
        );
      }
      content.push({ type: 'image_url', image_url: { url: image } });
    }
    content.push({ type: 'text', text: textWithSwitches });

    const body = { model: realModelName(model.code), content };
    const baseUrl = resolveBaseUrl(ctx.account.credentials);
    const parsed = await this.callApi(
      'POST',
      `${baseUrl}/contents/generations/tasks`,
      apiKey,
      body,
      agent,
    );
    const taskId = parsed.id;
    if (!taskId) {
      throw new AdapterError(
        'unknown',
        `seedance submit returned no task id: ${JSON.stringify(parsed).slice(0, 300)}`,
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
    const baseUrl = resolveBaseUrl(ctx.account.credentials);
    const url = `${baseUrl}/contents/generations/tasks/${encodeURIComponent(providerJobId)}`;
    const parsed = await this.callApi('GET', url, apiKey, undefined, agent);

    const status = parsed.status;
    if (status === 'queued' || status === 'running') {
      return { pending: true, providerJobId };
    }
    if (status === 'failed' || status === 'cancelled') {
      throw classifySeedanceError(200, parsed, null);
    }
    if (status === 'succeeded') {
      const videoUrl = parsed.content?.video_url;
      if (!videoUrl) {
        throw new AdapterError(
          'unknown',
          'seedance task succeeded but no video URL',
        );
      }
      const downloaded = await this.downloadVideo(videoUrl, agent);
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
      (c['arkApiKey'] as string | undefined) ??
      (c['ark_api_key'] as string | undefined);
    if (typeof v !== 'string' || v.length === 0) {
      throw new AdapterError(
        'invalid_credentials',
        'seedance account credentials missing apiKey',
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
  ): Promise<SeedanceTaskResponse> {
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
        `network error calling seedance: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const text = await res.text();
    let parsed: SeedanceTaskResponse = {};
    try {
      parsed = text ? (JSON.parse(text) as SeedanceTaskResponse) : {};
    } catch {
      parsed = {};
    }
    if (!res.ok) {
      throw classifySeedanceError(res.status, parsed, res.headers.get('retry-after'));
    }
    return parsed;
  }

  private async downloadVideo(
    url: string,
    agent: HttpsProxyAgent<string> | undefined,
  ): Promise<{ body: Buffer; mimeType: string }> {
    const init: RequestInit & { agent?: unknown } = { method: 'GET' };
    if (agent) init.agent = agent;
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new AdapterError(
        'temporary',
        `failed to download seedance video: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!res.ok) {
      throw new AdapterError(
        'temporary',
        `failed to download seedance video: status=${res.status}`,
      );
    }
    const mimeType = res.headers.get('content-type') ?? 'video/mp4';
    const buf = Buffer.from(await res.arrayBuffer());
    return { body: buf, mimeType };
  }
}
