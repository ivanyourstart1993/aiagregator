import { Injectable, Logger } from '@nestjs/common';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { safeFetchAsBase64 } from '@aiagg/shared';
import { StorageService } from '../../../common/storage/storage.service';
import {
  AdapterError,
  type AdapterContext,
  type AdapterFile,
  type AdapterResult,
  type ProviderAdapter,
} from './provider-adapter.interface';

const SUPPORTED_MODELS = new Set([
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
  // Imagen on Vertex (Service Account only). text_to_image only — Imagen
  // edit uses a different request shape we don't model in this adapter.
  'imagen-4.0-generate-001',
  'imagen-4.0-ultra-generate-001',
]);

const SUPPORTED_METHODS = new Set([
  'text_to_image',
  'image_edit',
  'image_to_image',
  'multi_reference_image',
]);

interface GeminiInlineData {
  inlineData?: { mimeType?: string; data?: string };
  text?: string;
}

interface GeminiContent {
  parts?: GeminiInlineData[];
}

interface GeminiCandidate {
  content?: GeminiContent;
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
  error?: {
    code?: number;
    status?: string;
    message?: string;
  };
}

function pickAspect(params: Record<string, unknown>): string | undefined {
  const a = params['aspect_ratio'] ?? params['aspectRatio'];
  return typeof a === 'string' ? a : undefined;
}

function pickResolution(params: Record<string, unknown>): string | undefined {
  const r = params['resolution'];
  return typeof r === 'string' ? r : undefined;
}

function pickImagesCount(params: Record<string, unknown>): number {
  const n = params['images_count'] ?? params['imagesCount'] ?? params['count'];
  if (typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 8) {
    return Math.trunc(n);
  }
  return 1;
}

function extToMime(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
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
  // SSRF-safe: rejects private/loopback/cloud-metadata destinations and
  // caps response size + total time per env.
  try {
    return await safeFetchAsBase64(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AdapterError(
      'validation',
      `failed to fetch source image: ${msg}`,
    );
  }
}

async function buildInlineImages(
  params: Record<string, unknown>,
): Promise<Array<{ inlineData: { mimeType: string; data: string } }>> {
  const out: Array<{ inlineData: { mimeType: string; data: string } }> = [];
  const candidates: unknown[] = [];
  const single = params['image'] ?? params['source_image'] ?? params['input_image'];
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
      const fetched = await fetchAsBase64(c);
      out.push({ inlineData: fetched });
    }
  }
  return out;
}

@Injectable()
export class GoogleBananaAdapter implements ProviderAdapter {
  public readonly providerCode = 'google_banana';
  private readonly logger = new Logger(GoogleBananaAdapter.name);

  constructor(private readonly storage: StorageService) {}

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

    const prompt =
      typeof params['prompt'] === 'string' ? (params['prompt'] as string) : '';
    if (method.code !== 'text_to_image') {
      const inlineImages = await buildInlineImages(params);
      parts.push(...inlineImages);
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
    const resolution = pickResolution(params);
    const imageConfig: Record<string, unknown> = {};
    if (aspect) imageConfig.aspectRatio = aspect;
    if (resolution) imageConfig.resolution = resolution;
    if (Object.keys(imageConfig).length > 0) {
      generationConfig.imageConfig = imageConfig;
    }

    const count = pickImagesCount(params);
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.code)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const dispatcher = this.buildProxyAgent(ctx);

    const files: AdapterFile[] = [];
    for (let i = 0; i < count; i++) {
      const body = {
        contents: [{ parts }],
        generationConfig,
      };
      const response = await this.callApi(url, body, dispatcher);
      const parsed = this.extractFiles(response);
      if (parsed.length === 0) {
        throw new AdapterError(
          'unknown',
          `google response contained no images (candidate ${i})`,
        );
      }
      for (const item of parsed) {
        const ext = mimeToExt(item.mimeType);
        const key = this.storage.buildResultKey({
          userId: ctx.userId,
          taskId: ctx.taskId,
          filename: `image_${i}.${ext}`,
        });
        const buf = Buffer.from(item.data, 'base64');
        const uploaded = await this.storage.upload({
          key,
          body: buf,
          contentType: item.mimeType || extToMime(ext),
        });
        files.push({
          url: uploaded.url,
          mimeType: item.mimeType || extToMime(ext),
          bucket: uploaded.bucket,
          key: uploaded.key,
          size: uploaded.size,
          fileType: 'image',
        });
      }
    }

    return { files };
  }

  async validateAccount(
    credentials: Record<string, unknown>,
  ): Promise<{ ok: boolean; reason?: string }> {
    // API key path — AI Studio. List a single model to confirm the key works.
    const apiKey =
      (credentials['apiKey'] as string | undefined) ??
      (credentials['api_key'] as string | undefined) ??
      (credentials['key'] as string | undefined);
    if (apiKey) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=1`,
          { method: 'GET' },
        );
        if (res.status === 401 || res.status === 403) {
          return { ok: false, reason: `http ${res.status}` };
        }
        if (res.status >= 200 && res.status < 300) return { ok: true };
        return { ok: false, reason: `http ${res.status}` };
      } catch (err) {
        return {
          ok: false,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // Service Account path — Vertex AI. The cheapest probe is the OAuth2
    // JWT-bearer exchange itself: if Google issues an access_token, the
    // SA's private key + email are valid and the project is reachable.
    // We don't call any aiplatform endpoint here so the cron stays cheap
    // and doesn't burn quota on probes.
    const sa = this.extractServiceAccount(credentials);
    if (sa) {
      try {
        const ok = await this.probeServiceAccountToken(sa);
        return ok ? { ok: true } : { ok: false, reason: 'sa token exchange failed' };
      } catch (err) {
        return {
          ok: false,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return { ok: false, reason: 'missing apiKey or serviceAccount' };
  }

  private extractServiceAccount(
    credentials: Record<string, unknown>,
  ): { client_email: string; private_key: string; project_id: string; token_uri?: string } | null {
    let raw: unknown =
      credentials['serviceAccount'] ??
      credentials['service_account'] ??
      credentials['serviceAccountKey'] ??
      credentials['serviceAccountJson'];
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        return null;
      }
    }
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const email = obj['client_email'];
    const key = obj['private_key'];
    const project = obj['project_id'];
    if (
      typeof email !== 'string' ||
      typeof key !== 'string' ||
      typeof project !== 'string'
    ) {
      return null;
    }
    return {
      client_email: email,
      private_key: key,
      project_id: project,
      token_uri:
        typeof obj['token_uri'] === 'string'
          ? (obj['token_uri'] as string)
          : undefined,
    };
  }

  private async probeServiceAccountToken(sa: {
    client_email: string;
    private_key: string;
    token_uri?: string;
  }): Promise<boolean> {
    const { createSign } = await import('node:crypto');
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const tokenUri = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: tokenUri,
      exp: now + 600,
      iat: now,
    };
    const data = `${enc(header)}.${enc(payload)}`;
    const sig = createSign('RSA-SHA256').update(data).sign(sa.private_key, 'base64url');
    const jwt = `${data}.${sig}`;
    const res = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }).toString(),
    });
    if (!res.ok) return false;
    const j = (await res.json()) as { access_token?: string };
    return typeof j.access_token === 'string' && j.access_token.length > 0;
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
      protocol === 'SOCKS5' ? 'socks5' : protocol === 'HTTPS' ? 'https' : 'http';
    const auth =
      login && password
        ? `${encodeURIComponent(login)}:${encodeURIComponent(password)}@`
        : '';
    const proxyUrl = `${scheme}://${auth}${host}:${port}`;
    try {
      return new HttpsProxyAgent(proxyUrl);
    } catch (err) {
      this.logger.warn(
        `failed to construct proxy agent: ${err instanceof Error ? err.message : String(err)}`,
      );
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
      const init: RequestInit & { dispatcher?: unknown; agent?: unknown } = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      };
      if (agent) {
        // node-fetch / undici don't share an "agent" property, but Node 18+
        // global fetch (undici) honours `dispatcher`. We pass through both
        // for forward-compat; HttpsProxyAgent works as a node http agent.
        init.agent = agent;
      }
      res = await fetch(url, init);
    } catch (err) {
      throw new AdapterError(
        'temporary',
        `network error calling google: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        err,
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
        parsed.error?.message ?? `google returned status ${status}: ${text.slice(0, 500)}`;
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
