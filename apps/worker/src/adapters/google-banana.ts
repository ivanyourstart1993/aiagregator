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
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
]);

const SUPPORTED_METHODS = new Set([
  'text_to_image',
  'image_edit',
  'image_to_image',
  'multi_reference_image',
]);

interface GeminiPart {
  inlineData?: { mimeType?: string; data?: string };
  text?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; status?: string; message?: string };
}

function pickAspect(p: Record<string, unknown>): string | undefined {
  const a = p['aspect_ratio'] ?? p['aspectRatio'];
  return typeof a === 'string' ? a : undefined;
}
function pickResolution(p: Record<string, unknown>): string | undefined {
  const r = p['resolution'];
  return typeof r === 'string' ? r : undefined;
}
function pickImagesCount(p: Record<string, unknown>): number {
  const n = p['images_count'] ?? p['imagesCount'] ?? p['count'];
  if (typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 8) {
    return Math.trunc(n);
  }
  return 1;
}
function mimeToExt(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  return 'png';
}

async function fetchAsBase64(
  url: string,
): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new AdapterError(
      'validation',
      `failed to fetch source image (${res.status}): ${url}`,
    );
  }
  const ct = res.headers.get('content-type') ?? 'image/png';
  const buf = Buffer.from(await res.arrayBuffer());
  return { data: buf.toString('base64'), mimeType: ct };
}

async function buildInlineImages(
  params: Record<string, unknown>,
): Promise<Array<{ inlineData: { mimeType: string; data: string } }>> {
  const out: Array<{ inlineData: { mimeType: string; data: string } }> = [];
  const candidates: unknown[] = [];
  const single =
    params['image'] ?? params['source_image'] ?? params['input_image'];
  if (typeof single === 'string') candidates.push(single);
  const list =
    params['images'] ?? params['reference_images'] ?? params['input_images'];
  if (Array.isArray(list)) {
    for (const v of list) candidates.push(v);
  }
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    if (c.startsWith('data:')) {
      const m = /^data:([^;]+);base64,(.+)$/.exec(c);
      if (m) out.push({ inlineData: { mimeType: m[1]!, data: m[2]! } });
    } else if (/^https?:\/\//.test(c)) {
      out.push({ inlineData: await fetchAsBase64(c) });
    }
  }
  return out;
}

export class GoogleBananaAdapter implements ProviderAdapter {
  public readonly providerCode = 'google_banana';

  constructor(private readonly storage: WorkerStorage) {}

  supports(modelCode: string, methodCode: string): boolean {
    return SUPPORTED_MODELS.has(modelCode) && SUPPORTED_METHODS.has(methodCode);
  }

  async execute(ctx: AdapterContext): Promise<AdapterResult> {
    const apiKey = this.extractApiKey(ctx);
    if (!apiKey) {
      throw new AdapterError(
        'invalid_credentials',
        'google_banana account credentials missing apiKey',
      );
    }

    const { method, model, params } = ctx;
    const parts: unknown[] = [];
    const prompt = typeof params['prompt'] === 'string' ? params['prompt'] : '';
    if (method.code !== 'text_to_image') {
      parts.push(...(await buildInlineImages(params)));
    }
    if (prompt) parts.push({ text: prompt });
    if (parts.length === 0) {
      throw new AdapterError(
        'validation',
        'request must include prompt and/or input images',
      );
    }

    const generationConfig: Record<string, unknown> = {
      responseModalities: ['IMAGE'],
    };
    const aspect = pickAspect(params);
    // NOTE: `resolution` is part of our bundle key for pricing tiers (0.5K/1K/2K/4K)
    // but the current Gemini Image API only accepts `aspectRatio` inside imageConfig
    // and rejects `resolution` with `Cannot find field`. Keep resolution out of the
    // outbound payload — Google picks the rendering size automatically.
    const imageConfig: Record<string, unknown> = {};
    if (aspect) imageConfig.aspectRatio = aspect;
    if (Object.keys(imageConfig).length > 0) {
      generationConfig.imageConfig = imageConfig;
    }
    void pickResolution; // keep helper exported for future API revisions

    const count = pickImagesCount(params);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.code)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const agent = this.buildProxyAgent(ctx);
    const files: AdapterFile[] = [];

    for (let i = 0; i < count; i++) {
      const body = { contents: [{ parts }], generationConfig };
      const parsed = await this.callApi(url, body, agent);
      const extracted = this.extractFiles(parsed);
      if (extracted.length === 0) {
        throw new AdapterError(
          'unknown',
          `google response contained no images (candidate ${i})`,
        );
      }
      for (const item of extracted) {
        const ext = mimeToExt(item.mimeType);
        const key = this.storage.buildKey({
          userId: ctx.userId,
          taskId: ctx.taskId,
          filename: `image_${i}.${ext}`,
        });
        const uploaded = await this.storage.upload({
          key,
          body: Buffer.from(item.data, 'base64'),
          contentType: item.mimeType || 'image/png',
        });
        files.push({
          url: uploaded.url,
          mimeType: item.mimeType || 'image/png',
          bucket: uploaded.bucket,
          key: uploaded.key,
          size: uploaded.size,
          fileType: 'image',
        });
      }
    }

    return { files };
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
    body: unknown,
    agent: HttpsProxyAgent<string> | undefined,
  ): Promise<GeminiResponse> {
    let res: Response;
    try {
      const init: RequestInit & { agent?: unknown } = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      };
      if (agent) init.agent = agent;
      res = await fetch(url, init);
    } catch (err) {
      throw new AdapterError(
        'temporary',
        `network error calling google: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const text = await res.text();
    let parsed: GeminiResponse;
    try {
      parsed = text ? (JSON.parse(text) as GeminiResponse) : {};
    } catch {
      parsed = {};
    }
    if (!res.ok) {
      const status = res.status;
      const message =
        parsed.error?.message ??
        `google returned status ${status}: ${text.slice(0, 500)}`;
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
    if (parsed.promptFeedback?.blockReason) {
      throw new AdapterError(
        'content_rejected',
        `blocked by safety filter: ${parsed.promptFeedback.blockReason}`,
      );
    }
    const finish = parsed.candidates?.[0]?.finishReason;
    if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT') {
      throw new AdapterError('content_rejected', `finishReason=${finish}`);
    }
    return parsed;
  }

  private extractFiles(
    resp: GeminiResponse,
  ): Array<{ data: string; mimeType: string }> {
    const out: Array<{ data: string; mimeType: string }> = [];
    for (const cand of resp.candidates ?? []) {
      for (const part of cand.content?.parts ?? []) {
        const inline = part.inlineData;
        if (inline?.data) {
          out.push({
            data: inline.data,
            mimeType: inline.mimeType ?? 'image/png',
          });
        }
      }
    }
    return out;
  }
}
