import { createSign } from 'node:crypto';
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

// Catalog model code → Vertex AI Gemini model code for `generateContent`.
// Vertex publishers/google/models uses different names than AI Studio for
// the same family — calling /models/{ai-studio-name}:generateContent
// returns 404 "Publisher Model not found". Verified against the live
// Vertex API on 2026-05-01: only `gemini-2.5-flash-image` is reachable;
// no `*-pro-image` variant is published yet, so Pro falls back to Flash.
function vertexGeminiModelFor(catalogModelCode: string): string {
  if (catalogModelCode === 'gemini-3.1-flash-image-preview') {
    return 'gemini-2.5-flash-image';
  }
  if (catalogModelCode === 'gemini-3-pro-image-preview') {
    return 'gemini-2.5-flash-image'; // Vertex has no Pro Gemini-image yet.
  }
  return catalogModelCode;
}

function isImagenModel(catalogModelCode: string): boolean {
  return catalogModelCode.startsWith('imagen-');
}

const VERTEX_LOCATION = 'us-central1';

const SUPPORTED_IMAGE_MODELS = new Set([
  // Gemini family (Nano Banana). text_to_image and image_edit go through
  // Vertex `generateContent` on Vertex SA path or AI Studio on key path.
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
  // Imagen family (Vertex SA only). text_to_image via Vertex `:predict`.
  // image_edit/image_to_image are NOT supported on these — Imagen edit
  // uses a different endpoint shape we don't model yet.
  'imagen-4.0-generate-001',
  'imagen-4.0-ultra-generate-001',
]);

const SUPPORTED_TEXT_MODELS = new Set([
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
]);

const SUPPORTED_EMBEDDING_MODELS = new Set(['text-embedding-004']);

const SUPPORTED_IMAGE_METHODS = new Set([
  'text_to_image',
  'image_edit',
  'image_to_image',
  'multi_reference_image',
]);

const SUPPORTED_TEXT_METHODS = new Set(['text_generation']);
const SUPPORTED_EMBEDDING_METHODS = new Set(['embedding']);

interface GeminiPart {
  inlineData?: { mimeType?: string; data?: string };
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { role?: string; parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { code?: number; status?: string; message?: string };
}

interface GeminiEmbeddingResponse {
  embedding?: { values?: number[] };
  embeddings?: Array<{ values?: number[] }>;
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

// --- Gemini text helpers (chat completion / structured output / tools) ---

interface GeminiMessageContent {
  role: 'user' | 'model';
  parts: Array<{ text?: string }>;
}

function buildGeminiContents(
  params: Record<string, unknown>,
): GeminiMessageContent[] {
  const messages = params['messages'];
  if (Array.isArray(messages) && messages.length > 0) {
    const out: GeminiMessageContent[] = [];
    for (const raw of messages) {
      if (!raw || typeof raw !== 'object') continue;
      const m = raw as Record<string, unknown>;
      const role = m['role'];
      if (role === 'system') continue;
      const geminiRole: 'user' | 'model' = role === 'assistant' ? 'model' : 'user';
      const content = m['content'];
      const parts: Array<{ text?: string }> = [];
      if (typeof content === 'string') {
        parts.push({ text: content });
      } else if (Array.isArray(content)) {
        for (const item of content) {
          if (!item || typeof item !== 'object') continue;
          const it = item as Record<string, unknown>;
          if (it['type'] === 'text' && typeof it['text'] === 'string') {
            parts.push({ text: it['text'] as string });
          }
        }
      }
      if (parts.length > 0) out.push({ role: geminiRole, parts });
    }
    if (out.length > 0) return out;
  }
  const prompt = params['prompt'];
  if (typeof prompt === 'string' && prompt.length > 0) {
    return [{ role: 'user', parts: [{ text: prompt }] }];
  }
  throw new AdapterError(
    'validation',
    'text_generation requires either `messages` or `prompt`',
  );
}

function buildSystemInstruction(
  params: Record<string, unknown>,
): { parts: Array<{ text: string }> } | null {
  const sys = params['system_instruction'] ?? params['systemInstruction'];
  if (typeof sys === 'string' && sys.length > 0) {
    return { parts: [{ text: sys }] };
  }
  const messages = params['messages'];
  if (Array.isArray(messages)) {
    const sysParts: Array<{ text: string }> = [];
    for (const raw of messages) {
      if (!raw || typeof raw !== 'object') continue;
      const m = raw as Record<string, unknown>;
      if (m['role'] === 'system' && typeof m['content'] === 'string') {
        sysParts.push({ text: m['content'] as string });
      }
    }
    if (sysParts.length > 0) return { parts: sysParts };
  }
  return null;
}

function buildTools(
  params: Record<string, unknown>,
): Array<{ functionDeclarations: Array<Record<string, unknown>> }> | null {
  const tools = params['tools'];
  if (!Array.isArray(tools) || tools.length === 0) return null;
  const decls: Array<Record<string, unknown>> = [];
  for (const raw of tools) {
    if (!raw || typeof raw !== 'object') continue;
    const t = raw as Record<string, unknown>;
    if (t['type'] !== 'function') continue;
    const fn = t['function'] as Record<string, unknown> | undefined;
    if (!fn || typeof fn['name'] !== 'string') continue;
    const decl: Record<string, unknown> = { name: fn['name'] };
    if (typeof fn['description'] === 'string') decl.description = fn['description'];
    if (fn['parameters'] && typeof fn['parameters'] === 'object') {
      decl.parameters = fn['parameters'];
    }
    decls.push(decl);
  }
  if (decls.length === 0) return null;
  return [{ functionDeclarations: decls }];
}

function buildToolConfig(choice: unknown): Record<string, unknown> {
  if (typeof choice === 'string') {
    const mode =
      choice === 'auto'
        ? 'AUTO'
        : choice === 'none'
          ? 'NONE'
          : choice === 'required'
            ? 'ANY'
            : 'AUTO';
    return { functionCallingConfig: { mode } };
  }
  if (choice && typeof choice === 'object') {
    const c = choice as Record<string, unknown>;
    if (c['type'] === 'function') {
      const fn = c['function'] as Record<string, unknown> | undefined;
      if (fn && typeof fn['name'] === 'string') {
        return {
          functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: [fn['name']],
          },
        };
      }
    }
  }
  return { functionCallingConfig: { mode: 'AUTO' } };
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
    if (
      SUPPORTED_IMAGE_MODELS.has(modelCode) &&
      SUPPORTED_IMAGE_METHODS.has(methodCode)
    ) {
      return true;
    }
    if (
      SUPPORTED_TEXT_MODELS.has(modelCode) &&
      SUPPORTED_TEXT_METHODS.has(methodCode)
    ) {
      return true;
    }
    if (
      SUPPORTED_EMBEDDING_MODELS.has(modelCode) &&
      SUPPORTED_EMBEDDING_METHODS.has(methodCode)
    ) {
      return true;
    }
    return false;
  }

  async execute(ctx: AdapterContext): Promise<AdapterResult> {
    // Text + embedding methods go via AI Studio (API key) regardless of
    // whether the account also has a Service Account — Vertex SA path for
    // text/embedding is on the roadmap. Image methods continue to prefer SA
    // if available (Vertex billing) and fall back to AI Studio.
    if (
      SUPPORTED_EMBEDDING_METHODS.has(ctx.method.code) ||
      SUPPORTED_TEXT_METHODS.has(ctx.method.code)
    ) {
      const apiKey = this.extractApiKey(ctx);
      if (!apiKey) {
        throw new AdapterError(
          'invalid_credentials',
          'google_banana text/embedding requires apiKey credential',
        );
      }
      if (SUPPORTED_EMBEDDING_METHODS.has(ctx.method.code)) {
        return this.executeEmbedding(ctx, apiKey);
      }
      return this.executeTextGeneration(ctx, apiKey);
    }

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
    // Fallback: credentials may be the plain Service Account JSON itself
    // (no wrapper key). Detect by the canonical `type: "service_account"` field
    // or the presence of client_email + private_key + project_id.
    if (raw === undefined) {
      if (
        c['type'] === 'service_account' ||
        (typeof c['client_email'] === 'string' &&
          typeof c['private_key'] === 'string' &&
          typeof c['project_id'] === 'string')
      ) {
        raw = c;
      }
    }
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
    const { method } = ctx;
    if (!SUPPORTED_IMAGE_METHODS.has(method.code)) {
      throw new AdapterError('validation', `unsupported method: ${method.code}`);
    }

    const { model } = ctx;

    // Routing: which Vertex API to hit depends on BOTH method and model family.
    //
    //   gemini-* + any image method  → Vertex `generateContent` (one path,
    //                                  reused for text_to_image and edits)
    //   imagen-* + text_to_image     → Vertex `:predict` (Imagen-native API)
    //   imagen-* + image_edit/etc.   → unsupported here (Imagen edit uses a
    //                                  different request shape we don't model)
    //
    // Historically text_to_image on a `gemini-*` catalog code silently
    // routed to Imagen :predict — clients asking for Gemini Flash actually
    // got Imagen 4 outputs. That's now fixed: Gemini codes always hit Gemini.
    if (!isImagenModel(model.code)) {
      return this.executeVertexGemini(ctx, sa);
    }

    if (method.code !== 'text_to_image') {
      throw new AdapterError(
        'validation',
        `imagen models support only text_to_image via this adapter; got ${method.code}`,
      );
    }

    const { params } = ctx;
    const prompt = typeof params['prompt'] === 'string' ? params['prompt'] : '';
    if (!prompt) {
      throw new AdapterError('validation', 'prompt is required');
    }

    const access = await getSAAccessToken(sa);
    // Imagen catalog codes are already valid Vertex publisher model names
    // (`imagen-4.0-generate-001` etc.) — no mapping needed.
    const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${sa.project_id}/locations/${VERTEX_LOCATION}/publishers/google/models/${encodeURIComponent(model.code)}:predict`;

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

  private async executeVertexGemini(
    ctx: AdapterContext,
    sa: ServiceAccountKey,
  ): Promise<AdapterResult> {
    const { model, params } = ctx;
    const prompt = typeof params['prompt'] === 'string' ? params['prompt'] : '';

    const parts: unknown[] = [];
    parts.push(...(await buildInlineImages(params)));
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
    if (aspect) generationConfig.imageConfig = { aspectRatio: aspect };

    const access = await getSAAccessToken(sa);
    const vertexModel = vertexGeminiModelFor(model.code);
    const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${sa.project_id}/locations/${VERTEX_LOCATION}/publishers/google/models/${encodeURIComponent(vertexModel)}:generateContent`;
    const agent = this.buildProxyAgent(ctx);
    const count = pickImagesCount(params);
    const files: AdapterFile[] = [];

    for (let i = 0; i < count; i++) {
      // Vertex `generateContent` requires `role` on each content (AI Studio
      // is more lenient — both omitting role and `user` work — Vertex 400s
      // without it: "Please use a valid role: user, model.").
      const body = { contents: [{ role: 'user', parts }], generationConfig };
      const parsed = await this.callApi(url, body, agent, {
        authorization: `Bearer ${access}`,
      });
      const extracted = this.extractFiles(parsed);
      if (extracted.length === 0) {
        throw new AdapterError(
          'unknown',
          `vertex gemini response contained no images (candidate ${i})`,
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

  /**
   * Low-level POST → JSON. Maps Google HTTP errors → AdapterError but does
   * NOT inspect candidate content (no SAFETY/promptFeedback checks). Shared
   * by image (via callApi), text completion, and embeddings.
   */
  private async callRawApi(
    url: string,
    body: unknown,
    agent: HttpsProxyAgent<string> | undefined,
    extraHeaders?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      const init: RequestInit & { agent?: unknown } = {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...extraHeaders },
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
    let parsed: Record<string, unknown>;
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      parsed = {};
    }
    if (!res.ok) {
      const status = res.status;
      const errObj =
        (parsed.error as { message?: string; status?: string } | undefined) ??
        undefined;
      const message =
        errObj?.message ??
        `google returned status ${status}: ${text.slice(0, 500)}`;
      const code = errObj?.status ?? '';
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
    return parsed;
  }

  private async callApi(
    url: string,
    body: unknown,
    agent: HttpsProxyAgent<string> | undefined,
    extraHeaders?: Record<string, string>,
  ): Promise<GeminiResponse> {
    const parsed = (await this.callRawApi(
      url,
      body,
      agent,
      extraHeaders,
    )) as GeminiResponse;
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

  // -----------------------------------------------------------------------
  // Text generation (Gemini 2.5 chat completion / structured output / tools)
  // -----------------------------------------------------------------------
  private async executeTextGeneration(
    ctx: AdapterContext,
    apiKey: string,
  ): Promise<AdapterResult> {
    const { model, params } = ctx;
    const contents = buildGeminiContents(params);
    const systemInstruction = buildSystemInstruction(params);
    const generationConfig: Record<string, unknown> = {};
    const temperature = params['temperature'];
    const topP = params['top_p'] ?? params['topP'];
    const topK = params['top_k'] ?? params['topK'];
    const maxOut = params['max_output_tokens'] ?? params['maxOutputTokens'];
    const stop = params['stop_sequences'] ?? params['stopSequences'];
    const respMime = params['response_mime_type'] ?? params['responseMimeType'];
    const respSchema = params['response_schema'] ?? params['responseSchema'];
    if (typeof temperature === 'number') generationConfig.temperature = temperature;
    if (typeof topP === 'number') generationConfig.topP = topP;
    if (typeof topK === 'number') generationConfig.topK = topK;
    if (typeof maxOut === 'number') generationConfig.maxOutputTokens = maxOut;
    if (Array.isArray(stop) && stop.every((s) => typeof s === 'string')) {
      generationConfig.stopSequences = stop;
    }
    if (respSchema && typeof respSchema === 'object') {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = respSchema;
    } else if (typeof respMime === 'string') {
      generationConfig.responseMimeType = respMime;
    }

    const body: Record<string, unknown> = { contents, generationConfig };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    const tools = buildTools(params);
    if (tools) body.tools = tools;
    const toolChoice = params['tool_choice'] ?? params['toolChoice'];
    if (toolChoice !== undefined) {
      body.toolConfig = buildToolConfig(toolChoice);
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.code)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const agent = this.buildProxyAgent(ctx);
    const response = (await this.callRawApi(url, body, agent)) as GeminiResponse;

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    let text = '';
    const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    for (const part of parts) {
      if (typeof part.text === 'string') text += part.text;
      if (part.functionCall) {
        toolCalls.push({
          name: part.functionCall.name,
          arguments: part.functionCall.args ?? {},
        });
      }
    }
    if (!text && toolCalls.length === 0) {
      throw new AdapterError(
        'unknown',
        `google response contained no text or tool calls (finishReason=${candidate?.finishReason ?? 'unknown'})`,
      );
    }
    const usage = response.usageMetadata;
    const meta: Record<string, unknown> = {
      text,
      finish_reason: candidate?.finishReason ?? null,
      model: model.code,
      usage: usage
        ? {
            input_tokens: usage.promptTokenCount ?? 0,
            output_tokens: usage.candidatesTokenCount ?? 0,
            total_tokens: usage.totalTokenCount ?? 0,
          }
        : null,
    };
    if (toolCalls.length > 0) meta.tool_calls = toolCalls;
    return { meta };
  }

  // -----------------------------------------------------------------------
  // Text embedding
  // -----------------------------------------------------------------------
  private async executeEmbedding(
    ctx: AdapterContext,
    apiKey: string,
  ): Promise<AdapterResult> {
    const { model, params } = ctx;
    const inputRaw = params['input'];
    const inputs: string[] = [];
    if (typeof inputRaw === 'string') {
      inputs.push(inputRaw);
    } else if (Array.isArray(inputRaw)) {
      for (const v of inputRaw) {
        if (typeof v === 'string' && v.length > 0) inputs.push(v);
      }
    }
    if (inputs.length === 0) {
      throw new AdapterError(
        'validation',
        'embedding input must be a non-empty string or array of strings',
      );
    }
    if (inputs.length > 100) {
      throw new AdapterError(
        'validation',
        `embedding input array exceeds maximum size (got ${inputs.length}, max 100)`,
      );
    }

    const taskType =
      typeof params['task_type'] === 'string'
        ? (params['task_type'] as string)
        : typeof params['taskType'] === 'string'
          ? (params['taskType'] as string)
          : undefined;
    const title =
      typeof params['title'] === 'string' ? (params['title'] as string) : undefined;
    const outputDim =
      typeof params['output_dimensionality'] === 'number'
        ? (params['output_dimensionality'] as number)
        : typeof params['outputDimensionality'] === 'number'
          ? (params['outputDimensionality'] as number)
          : undefined;

    const buildRequest = (text: string): Record<string, unknown> => {
      const req: Record<string, unknown> = {
        model: `models/${model.code}`,
        content: { parts: [{ text }] },
      };
      if (taskType) req.taskType = taskType;
      if (title && taskType === 'RETRIEVAL_DOCUMENT') req.title = title;
      if (typeof outputDim === 'number' && outputDim > 0) req.outputDimensionality = outputDim;
      return req;
    };

    const agent = this.buildProxyAgent(ctx);
    const embeddings: number[][] = [];

    if (inputs.length === 1) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.code)}:embedContent?key=${encodeURIComponent(apiKey)}`;
      const single = buildRequest(inputs[0]!);
      delete single.model; // single endpoint rejects `model` in body
      const resp = (await this.callRawApi(url, single, agent)) as GeminiEmbeddingResponse;
      const values = resp.embedding?.values;
      if (!Array.isArray(values)) {
        throw new AdapterError('unknown', 'google returned no embedding values');
      }
      embeddings.push(values);
    } else {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.code)}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`;
      const body = { requests: inputs.map((t) => buildRequest(t)) };
      const resp = (await this.callRawApi(url, body, agent)) as GeminiEmbeddingResponse;
      const list = resp.embeddings ?? [];
      if (list.length !== inputs.length) {
        throw new AdapterError(
          'unknown',
          `google returned ${list.length} embeddings for ${inputs.length} inputs`,
        );
      }
      for (const e of list) {
        if (!Array.isArray(e.values)) {
          throw new AdapterError('unknown', 'google returned embedding without values');
        }
        embeddings.push(e.values);
      }
    }

    return {
      meta: {
        model: model.code,
        embeddings,
        dimension: embeddings[0]?.length ?? 0,
        count: embeddings.length,
      },
    };
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
