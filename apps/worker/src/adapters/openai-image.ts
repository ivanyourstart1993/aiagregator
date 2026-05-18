import { HttpsProxyAgent } from 'https-proxy-agent';
import { safeFetchAsBase64 } from '@aiagg/shared';
import {
  AdapterError,
  type AdapterContext,
  type AdapterFile,
  type AdapterResult,
  type ProviderAdapter,
} from './types';
import type { WorkerStorage } from '../storage/storage';

const SUPPORTED_MODELS = new Set(['gpt-image-2', 'gpt-image-1', 'dall-e-3', 'dall-e-2']);
const EDITABLE_MODELS = new Set(['gpt-image-2', 'gpt-image-1', 'dall-e-2']);
const SUPPORTED_METHODS = new Set(['text_to_image', 'image_edit']);

// gpt-image-1 and gpt-image-2 share the same request envelope (native b64
// response, quality enum, background flag). Worth treating them as one
// "native" family so we don't sprinkle two-model conditionals everywhere.
function isNativeGptImage(modelCode: string): boolean {
  return modelCode === 'gpt-image-1' || modelCode === 'gpt-image-2';
}

const OPENAI_BASE = 'https://api.openai.com/v1';

interface OpenAIImageResponse {
  created?: number;
  data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
  error?: { code?: string; type?: string; message?: string; param?: string };
}

function pickString(p: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function pickImagesCount(p: Record<string, unknown>, max: number): number {
  const n = p['images_count'] ?? p['imagesCount'] ?? p['n'] ?? p['count'];
  if (typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= max) {
    return Math.trunc(n);
  }
  return 1;
}

function defaultSize(_modelCode: string): string {
  return '1024x1024';
}

function isValidSize(modelCode: string, size: string): boolean {
  if (modelCode === 'gpt-image-1') {
    return ['auto', '1024x1024', '1024x1536', '1536x1024'].includes(size);
  }
  if (modelCode === 'gpt-image-2') {
    // gpt-image-2 takes any size up to 3840px on the long edge, multiples of
    // 16, max 3:1 aspect ratio. We expose the canonical buckets that match
    // our bundle-price matrix; arbitrary sizes outside this list are
    // rejected here so a typo doesn't silently land in a no-price bundle.
    return [
      'auto',
      '1024x1024',
      '1024x1536',
      '1536x1024',
      '2048x2048',
      '3840x2160',
      '2160x3840',
    ].includes(size);
  }
  if (modelCode === 'dall-e-3') {
    return ['1024x1024', '1024x1792', '1792x1024'].includes(size);
  }
  if (modelCode === 'dall-e-2') {
    return ['256x256', '512x512', '1024x1024'].includes(size);
  }
  return false;
}

function defaultQuality(modelCode: string): string | null {
  if (isNativeGptImage(modelCode)) return 'medium';
  if (modelCode === 'dall-e-3') return 'standard';
  return null;
}

function isValidQuality(modelCode: string, quality: string): boolean {
  if (isNativeGptImage(modelCode)) {
    return ['auto', 'low', 'medium', 'high'].includes(quality);
  }
  if (modelCode === 'dall-e-3') {
    return ['standard', 'hd'].includes(quality);
  }
  return false;
}

function maxImagesPerRequest(modelCode: string): number {
  if (modelCode === 'dall-e-3') return 1;
  return 10;
}

function mimeToExt(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'png';
}

async function fetchImageBytes(
  url: string,
): Promise<{ body: Buffer; mimeType: string }> {
  try {
    const { data, mimeType } = await safeFetchAsBase64(url);
    return { body: Buffer.from(data, 'base64'), mimeType };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AdapterError('validation', `failed to fetch source image: ${msg}`);
  }
}

async function decodeInputImage(
  src: string,
): Promise<{ body: Buffer; mimeType: string }> {
  if (src.startsWith('data:')) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(src);
    if (!m) {
      throw new AdapterError('validation', 'invalid data: URL for input image');
    }
    return { body: Buffer.from(m[2]!, 'base64'), mimeType: m[1]! };
  }
  if (/^https?:\/\//.test(src)) return fetchImageBytes(src);
  throw new AdapterError(
    'validation',
    'input image must be a https:// URL or data: URI',
  );
}

function classifyOpenAIError(
  status: number,
  body: OpenAIImageResponse,
  retryAfter?: string | null,
): AdapterError {
  const errCode = body.error?.code ?? '';
  const errType = body.error?.type ?? '';
  const msg = body.error?.message ?? `openai error status=${status}`;
  if (status === 401 || status === 403 || errCode === 'invalid_api_key') {
    return new AdapterError('invalid_credentials', msg);
  }
  if (status === 429 || errCode === 'rate_limit_exceeded') {
    const retryMs = retryAfter ? Number(retryAfter) * 1000 : undefined;
    if (/quota|billing|insufficient/i.test(msg)) {
      return new AdapterError('billing', msg);
    }
    return new AdapterError('rate_limit', msg, retryMs);
  }
  if (status >= 500) return new AdapterError('temporary', msg);
  if (
    errCode === 'content_policy_violation' ||
    errCode === 'moderation_blocked' ||
    /safety|content.?policy|moderation/i.test(msg)
  ) {
    return new AdapterError('content_rejected', msg);
  }
  if (errCode === 'insufficient_quota' || /quota|billing|insufficient_quota/i.test(msg)) {
    return new AdapterError('billing', msg);
  }
  if (
    errType === 'invalid_request_error' ||
    /invalid|unsupported|must be|required/i.test(msg)
  ) {
    return new AdapterError('validation', msg);
  }
  return new AdapterError('unknown', msg);
}

export class OpenAiImageAdapter implements ProviderAdapter {
  public readonly providerCode = 'openai_image';

  constructor(private readonly storage: WorkerStorage) {}

  supports(modelCode: string, methodCode: string): boolean {
    if (!SUPPORTED_MODELS.has(modelCode)) return false;
    if (!SUPPORTED_METHODS.has(methodCode)) return false;
    if (methodCode === 'image_edit' && !EDITABLE_MODELS.has(modelCode)) return false;
    return true;
  }

  async execute(ctx: AdapterContext): Promise<AdapterResult> {
    const apiKey = this.extractApiKey(ctx);
    const agent = this.buildProxyAgent(ctx);
    const { method, params } = ctx;
    const prompt = pickString(params, 'prompt');
    if (!prompt) {
      throw new AdapterError('validation', 'prompt is required');
    }
    if (method.code === 'image_edit') {
      return this.executeEdit(ctx, apiKey, prompt, agent);
    }
    return this.executeGenerate(ctx, apiKey, prompt, agent);
  }

  private async executeGenerate(
    ctx: AdapterContext,
    apiKey: string,
    prompt: string,
    agent: HttpsProxyAgent<string> | undefined,
  ): Promise<AdapterResult> {
    const { model, params } = ctx;
    const n = pickImagesCount(params, maxImagesPerRequest(model.code));
    const size = this.resolveSize(model.code, params);
    const quality = this.resolveQuality(model.code, params);

    const body: Record<string, unknown> = {
      model: model.code,
      prompt,
      n,
      size,
    };
    if (quality) body.quality = quality;
    if (!isNativeGptImage(model.code)) body.response_format = 'b64_json';

    if (model.code === 'dall-e-3') {
      const style = pickString(params, 'style');
      if (style === 'vivid' || style === 'natural') body.style = style;
    }
    if (isNativeGptImage(model.code)) {
      const bg = pickString(params, 'background');
      if (bg === 'auto' || bg === 'transparent' || bg === 'opaque') {
        body.background = bg;
      }
    }

    const parsed = await this.callJson(
      `${OPENAI_BASE}/images/generations`,
      apiKey,
      body,
      agent,
    );
    return this.uploadResultFiles(ctx, parsed);
  }

  private async executeEdit(
    ctx: AdapterContext,
    apiKey: string,
    prompt: string,
    agent: HttpsProxyAgent<string> | undefined,
  ): Promise<AdapterResult> {
    const { model, params } = ctx;
    const n = pickImagesCount(params, maxImagesPerRequest(model.code));
    const size = this.resolveSize(model.code, params);
    const quality = this.resolveQuality(model.code, params);

    const sourceUrls: string[] = [];
    const single = pickString(params, 'image', 'source_image', 'input_image');
    if (single) sourceUrls.push(single);
    const list = params['input_images'] ?? params['images'] ?? params['reference_images'];
    if (Array.isArray(list)) {
      for (const v of list) if (typeof v === 'string') sourceUrls.push(v);
    }
    if (sourceUrls.length === 0) {
      throw new AdapterError(
        'validation',
        'image_edit requires at least one input image',
      );
    }
    if (model.code === 'dall-e-2' && sourceUrls.length > 1) {
      throw new AdapterError(
        'validation',
        'dall-e-2 image_edit accepts only one input image',
      );
    }

    const fd = new FormData();
    fd.append('model', model.code);
    fd.append('prompt', prompt);
    fd.append('n', String(n));
    fd.append('size', size);
    if (quality && isNativeGptImage(model.code)) fd.append('quality', quality);
    if (!isNativeGptImage(model.code)) fd.append('response_format', 'b64_json');

    for (let i = 0; i < sourceUrls.length; i++) {
      const decoded = await decodeInputImage(sourceUrls[i]!);
      const ext = mimeToExt(decoded.mimeType);
      const blob = new Blob([new Uint8Array(decoded.body)], { type: decoded.mimeType });
      fd.append('image', blob, `input_${i}.${ext}`);
    }

    const maskUrl = pickString(params, 'mask', 'mask_url');
    if (maskUrl) {
      const decoded = await decodeInputImage(maskUrl);
      const blob = new Blob([new Uint8Array(decoded.body)], { type: decoded.mimeType });
      fd.append('mask', blob, 'mask.png');
    }

    const parsed = await this.callMultipart(
      `${OPENAI_BASE}/images/edits`,
      apiKey,
      fd,
      agent,
    );
    return this.uploadResultFiles(ctx, parsed);
  }

  private resolveSize(modelCode: string, params: Record<string, unknown>): string {
    const raw = pickString(params, 'size', 'resolution');
    if (raw && isValidSize(modelCode, raw)) return raw;
    return defaultSize(modelCode);
  }

  private resolveQuality(
    modelCode: string,
    params: Record<string, unknown>,
  ): string | null {
    if (modelCode === 'dall-e-2') return null;
    const raw = pickString(params, 'quality', 'mode');
    if (raw && isValidQuality(modelCode, raw)) return raw;
    return defaultQuality(modelCode);
  }

  private async uploadResultFiles(
    ctx: AdapterContext,
    parsed: OpenAIImageResponse,
  ): Promise<AdapterResult> {
    const items = parsed.data ?? [];
    if (items.length === 0) {
      throw new AdapterError('unknown', 'openai response contained no images');
    }
    const files: AdapterFile[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      let buf: Buffer;
      let mimeType = 'image/png';
      if (item.b64_json) {
        buf = Buffer.from(item.b64_json, 'base64');
      } else if (item.url) {
        const fetched = await fetchImageBytes(item.url);
        buf = fetched.body;
        mimeType = fetched.mimeType;
      } else {
        continue;
      }
      const ext = mimeToExt(mimeType);
      const key = this.storage.buildKey({
        userId: ctx.userId,
        taskId: ctx.taskId,
        filename: `image_${i}.${ext}`,
      });
      const uploaded = await this.storage.upload({
        key,
        body: buf,
        contentType: mimeType,
      });
      files.push({
        url: uploaded.url,
        mimeType,
        bucket: uploaded.bucket,
        key: uploaded.key,
        size: uploaded.size,
        fileType: 'image',
      });
    }
    if (files.length === 0) {
      throw new AdapterError('unknown', 'openai response had no usable image data');
    }
    return { files };
  }

  private extractApiKey(ctx: AdapterContext): string {
    const c = ctx.account.credentials ?? {};
    const v =
      (c['apiKey'] as string | undefined) ??
      (c['api_key'] as string | undefined) ??
      (c['key'] as string | undefined);
    if (typeof v !== 'string' || v.length === 0) {
      throw new AdapterError(
        'invalid_credentials',
        'openai_image account credentials missing apiKey',
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

  private async callJson(
    url: string,
    apiKey: string,
    body: unknown,
    agent: HttpsProxyAgent<string> | undefined,
  ): Promise<OpenAIImageResponse> {
    let res: Response;
    try {
      const init: RequestInit & { agent?: unknown } = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      };
      if (agent) init.agent = agent;
      res = await fetch(url, init);
    } catch (err) {
      throw new AdapterError(
        'temporary',
        `network error calling openai: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return this.parseResponse(res);
  }

  private async callMultipart(
    url: string,
    apiKey: string,
    fd: FormData,
    agent: HttpsProxyAgent<string> | undefined,
  ): Promise<OpenAIImageResponse> {
    let res: Response;
    try {
      const init: RequestInit & { agent?: unknown } = {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}` },
        body: fd,
      };
      if (agent) init.agent = agent;
      res = await fetch(url, init);
    } catch (err) {
      throw new AdapterError(
        'temporary',
        `network error calling openai: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return this.parseResponse(res);
  }

  private async parseResponse(res: Response): Promise<OpenAIImageResponse> {
    const text = await res.text();
    let parsed: OpenAIImageResponse = {};
    try {
      parsed = text ? (JSON.parse(text) as OpenAIImageResponse) : {};
    } catch {
      parsed = {};
    }
    if (!res.ok) {
      throw classifyOpenAIError(res.status, parsed, res.headers.get('retry-after'));
    }
    return parsed;
  }
}
