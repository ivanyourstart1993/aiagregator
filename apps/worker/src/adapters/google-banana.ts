import { createSign } from 'node:crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  AdapterError,
  type AdapterContext,
  type AdapterFile,
  type AdapterResult,
  type ProviderAdapter,
} from './types';
import type { WorkerStorage } from '../storage/storage';

// ----- Service Account → Vertex AI auth (cached access tokens) -------------
interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
}

const saTokenCache = new Map<string, { token: string; expiresAt: number }>();

function signJwtRS256(header: object, payload: object, privateKey: string): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = `${enc(header)}.${enc(payload)}`;
  const sig = createSign('RSA-SHA256').update(data).sign(privateKey, 'base64url');
  return `${data}.${sig}`;
}

async function getSAAccessToken(sa: ServiceAccountKey): Promise<string> {
  const cached = saTokenCache.get(sa.client_email);
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt - 120 > now) return cached.token;

  const tokenUri = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const jwt = signJwtRS256(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: tokenUri,
      exp: now + 3600,
      iat: now,
    },
    sa.private_key,
  );
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new AdapterError(
      'invalid_credentials',
      `service-account token exchange failed: ${res.status} ${t.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new AdapterError('invalid_credentials', 'no access_token in token response');
  }
  saTokenCache.set(sa.client_email, {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600),
  });
  return json.access_token;
}

// AI Studio model code → Vertex AI model code (Imagen replaces Gemini image-preview)
function vertexModelFor(aiStudioModelCode: string): string {
  if (aiStudioModelCode.includes('pro-image')) return 'imagen-4.0-ultra-generate-001';
  return 'imagen-4.0-generate-001';
}

const VERTEX_LOCATION = 'us-central1';

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
    // Service Account credential? → Vertex AI / Imagen path (uses Cloud Billing).
    const sa = this.extractServiceAccount(ctx);
    if (sa) {
      return this.executeVertex(ctx, sa);
    }

    const apiKey = this.extractApiKey(ctx);
    if (!apiKey) {
      throw new AdapterError(
        'invalid_credentials',
        'google_banana account credentials missing apiKey or serviceAccount',
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

  private extractServiceAccount(ctx: AdapterContext): ServiceAccountKey | null {
    const c = ctx.account.credentials ?? {};
    let raw: unknown =
      c['serviceAccount'] ??
      c['service_account'] ??
      c['serviceAccountKey'] ??
      c['serviceAccountJson'];
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

  private async executeVertex(
    ctx: AdapterContext,
    sa: ServiceAccountKey,
  ): Promise<AdapterResult> {
    const { method, model, params } = ctx;
    if (!SUPPORTED_METHODS.has(method.code)) {
      throw new AdapterError('validation', `unsupported method: ${method.code}`);
    }
    const prompt = typeof params['prompt'] === 'string' ? params['prompt'] : '';
    if (!prompt && method.code === 'text_to_image') {
      throw new AdapterError('validation', 'prompt is required');
    }

    const access = await getSAAccessToken(sa);
    const vertexModel = vertexModelFor(model.code);
    const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${sa.project_id}/locations/${VERTEX_LOCATION}/publishers/google/models/${vertexModel}:predict`;

    const count = pickImagesCount(params);
    const aspect = pickAspect(params);
    const instances: Array<Record<string, unknown>> = [{ prompt }];
    const parameters: Record<string, unknown> = { sampleCount: count };
    if (aspect) parameters.aspectRatio = aspect;

    let res: Response;
    try {
      const init: RequestInit & { agent?: unknown } = {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${access}`,
        },
        body: JSON.stringify({ instances, parameters }),
      };
      const agent = this.buildProxyAgent(ctx);
      if (agent) init.agent = agent;
      res = await fetch(url, init);
    } catch (err) {
      throw new AdapterError(
        'temporary',
        `network error calling vertex: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const text = await res.text();
    let parsed: {
      predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
      error?: { code?: number; status?: string; message?: string };
    } = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      // fallthrough — leave parsed empty
    }
    if (!res.ok) {
      const status = res.status;
      const message =
        parsed.error?.message ??
        `vertex returned status ${status}: ${text.slice(0, 500)}`;
      const code = parsed.error?.status ?? '';
      if (status === 401 || status === 403) {
        throw new AdapterError('invalid_credentials', message);
      }
      // Hard billing/quota markers — these mean the account is unusable until
      // the operator fixes billing on Google's side. failAccount=true.
      const isHardQuota =
        /free_tier|limit:\s*0|prepayment|credits.*depleted|billing.*disabled/i.test(
          message,
        );
      // Per-minute / per-region rate limits — RESOURCE_EXHAUSTED with markers
      // like online_prediction_requests_per_base_model. These are TRANSIENT —
      // retry with backoff, do NOT mark the account as exhausted.
      const isPerMinuteRate =
        /requests_per_base_model|requests_per_minute|requests_per_region|requests_per_project|submit a quota increase/i.test(
          message,
        );
      if (isHardQuota) {
        throw new AdapterError('quota', message);
      }
      if (status === 429 || code === 'RESOURCE_EXHAUSTED' || isPerMinuteRate) {
        const retry = res.headers.get('retry-after');
        const retryMs = retry ? Number(retry) * 1000 : 30_000;
        throw new AdapterError('rate_limit', message, retryMs);
      }
      if (status === 400) throw new AdapterError('validation', message);
      if (status >= 500) throw new AdapterError('temporary', message);
      throw new AdapterError('unknown', message);
    }

    const preds = parsed.predictions ?? [];
    if (preds.length === 0) {
      throw new AdapterError('unknown', 'vertex response had no predictions');
    }

    const files: AdapterFile[] = [];
    for (let i = 0; i < preds.length; i++) {
      const p = preds[i];
      const data = p?.bytesBase64Encoded;
      if (!data) continue;
      const mime = p.mimeType ?? 'image/png';
      const ext = mimeToExt(mime);
      const key = this.storage.buildKey({
        userId: ctx.userId,
        taskId: ctx.taskId,
        filename: `image_${i}.${ext}`,
      });
      const uploaded = await this.storage.upload({
        key,
        body: Buffer.from(data, 'base64'),
        contentType: mime,
      });
      files.push({
        url: uploaded.url,
        mimeType: mime,
        bucket: uploaded.bucket,
        key: uploaded.key,
        size: uploaded.size,
        fileType: 'image',
      });
    }
    if (files.length === 0) {
      throw new AdapterError('unknown', 'vertex predictions had no image data');
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
      // Distinguish hard quota (free_tier limit:0, billing depleted) from
      // transient per-minute rate limits — same message family but vastly
      // different operator action: "fix billing" vs "wait 30s".
      const isHardQuota =
        /free_tier|limit:\s*0|prepayment|credits.*depleted|billing.*disabled/i.test(
          message,
        );
      const isPerMinuteRate =
        /requests_per_base_model|requests_per_minute|requests_per_region|requests_per_project|submit a quota increase/i.test(
          message,
        );
      if (isHardQuota) {
        throw new AdapterError('quota', message);
      }
      if (status === 429 || code === 'RESOURCE_EXHAUSTED' || isPerMinuteRate) {
        const retry = res.headers.get('retry-after');
        const retryMs = retry ? Number(retry) * 1000 : 30_000;
        throw new AdapterError('rate_limit', message, retryMs);
      }
      if (status === 400 && /quota/i.test(message)) {
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
