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

async function getSAAccessToken(
  sa: ServiceAccountKey,
  agent: HttpsProxyAgent<string>,
): Promise<string> {
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
  // Token exchange MUST go through the same proxy as the subsequent Vertex
  // call. Otherwise Google sees the SA token request from our datacenter
  // egress IP and the API call from the proxy — trivial correlation by
  // (client_email, timestamp, project_id) burns the whole pool.
  const init: RequestInit & { agent: unknown } = {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    agent,
  };
  const res = await fetch(tokenUri, init);
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

const SUPPORTED_TEXT_METHODS = new Set(['text_generation', 'image_to_text']);
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
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
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

type InlineImagePart = { inlineData: { mimeType: string; data: string } };

// Normalise one image input into a Gemini inlineData part. Accepts:
//   - a data: URI string                       (data:image/jpeg;base64,…)
//   - an https:// URL string                   (fetched to base64)
//   - { type:"base64", media_type, data }       (raw base64 or data: URI)
//   - { type:"url", url } / { url }             (fetched)
//   - { image_url: { url } } / { image_url }     (OpenAI chat image part)
async function imageToInlinePart(c: unknown): Promise<InlineImagePart | null> {
  if (typeof c === 'string') {
    if (c.startsWith('data:')) {
      const m = /^data:([^;]+);base64,(.+)$/.exec(c);
      return m ? { inlineData: { mimeType: m[1]!, data: m[2]! } } : null;
    }
    if (/^https?:\/\//.test(c)) return { inlineData: await fetchAsBase64(c) };
    return null;
  }
  if (c && typeof c === 'object') {
    const o = c as Record<string, unknown>;
    const iu = o['image_url'];
    if (typeof iu === 'string') return imageToInlinePart(iu);
    if (iu && typeof iu === 'object' && typeof (iu as Record<string, unknown>)['url'] === 'string') {
      return imageToInlinePart((iu as Record<string, unknown>)['url']);
    }
    const data = o['data'];
    if (typeof data === 'string' && data.length > 0) {
      if (data.startsWith('data:')) return imageToInlinePart(data);
      const mt = o['media_type'] ?? o['mime_type'] ?? o['mimeType'];
      return {
        inlineData: { mimeType: typeof mt === 'string' ? mt : 'image/jpeg', data },
      };
    }
    const url = o['url'];
    if (typeof url === 'string') return imageToInlinePart(url);
  }
  return null;
}

async function buildInlineImages(
  params: Record<string, unknown>,
): Promise<InlineImagePart[]> {
  const out: InlineImagePart[] = [];
  const candidates: unknown[] = [];
  const single =
    params['image'] ?? params['source_image'] ?? params['input_image'];
  if (single !== undefined && single !== null) candidates.push(single);
  const list =
    params['images'] ?? params['reference_images'] ?? params['input_images'];
  if (Array.isArray(list)) {
    for (const v of list) candidates.push(v);
  }
  for (const c of candidates) {
    const part = await imageToInlinePart(c);
    if (part) out.push(part);
  }
  return out;
}

// image_url parts carried inside chat `messages[].content` arrays.
async function imagePartsFromMessages(
  params: Record<string, unknown>,
): Promise<InlineImagePart[]> {
  const messages = params['messages'];
  if (!Array.isArray(messages)) return [];
  const out: InlineImagePart[] = [];
  for (const raw of messages) {
    if (!raw || typeof raw !== 'object') continue;
    const content = (raw as Record<string, unknown>)['content'];
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      const it = item as Record<string, unknown>;
      if (it['type'] === 'image_url' && it['image_url'] !== undefined) {
        const part = await imageToInlinePart(it['image_url']);
        if (part) out.push(part);
      }
    }
  }
  return out;
}

// All input images for a vision request: top-level image params + image_url
// parts inside messages.
async function collectGeminiImageParts(
  params: Record<string, unknown>,
): Promise<InlineImagePart[]> {
  const fromParams = await buildInlineImages(params);
  const fromMessages = await imagePartsFromMessages(params);
  return [...fromParams, ...fromMessages];
}

// Translate an OpenAI-style `response_format` into Gemini's generationConfig.
// No-op if responseSchema was already set (native response_schema wins).
//   { type:"json_schema", schema:{…} }            → responseSchema
//   { type:"json_schema", json_schema:{ schema } } → responseSchema (OpenAI shape)
//   { type:"json_object" }                         → responseMimeType only
function applyResponseFormat(
  params: Record<string, unknown>,
  generationConfig: Record<string, unknown>,
): void {
  if (generationConfig['responseSchema'] !== undefined) return;
  const rf = params['response_format'];
  if (!rf || typeof rf !== 'object') return;
  const o = rf as Record<string, unknown>;
  const js = o['json_schema'];
  const schema =
    o['schema'] && typeof o['schema'] === 'object'
      ? o['schema']
      : js && typeof js === 'object' && (js as Record<string, unknown>)['schema'] &&
          typeof (js as Record<string, unknown>)['schema'] === 'object'
        ? (js as Record<string, unknown>)['schema']
        : undefined;
  if (schema) {
    generationConfig['responseMimeType'] = 'application/json';
    generationConfig['responseSchema'] = schema;
  } else if (o['type'] === 'json_object' || o['type'] === 'json_schema') {
    generationConfig['responseMimeType'] = 'application/json';
  }
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
    // Text + embedding methods support BOTH credential paths:
    //   - Service Account → Vertex AI (preferred when SA present; Cloud billing)
    //   - API key → AI Studio (fallback for key-only accounts)
    // Image methods keep their existing preference (SA-first via executeVertex).
    if (
      SUPPORTED_EMBEDDING_METHODS.has(ctx.method.code) ||
      SUPPORTED_TEXT_METHODS.has(ctx.method.code)
    ) {
      const sa = this.extractServiceAccount(ctx);
      if (sa) {
        if (SUPPORTED_EMBEDDING_METHODS.has(ctx.method.code)) {
          return this.executeEmbeddingVertex(ctx, sa);
        }
        return this.executeTextGenerationVertex(ctx, sa);
      }
      const apiKey = this.extractApiKey(ctx);
      if (!apiKey) {
        throw new AdapterError(
          'invalid_credentials',
          'google_banana text/embedding requires apiKey OR serviceAccount credential',
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

    // Build proxy FIRST — throws if missing, so we skip the SA token
    // exchange entirely (no direct-IP touch of oauth2.googleapis.com).
    const agent = this.buildProxyAgent(ctx);
    const access = await getSAAccessToken(sa, agent);
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
      const init: RequestInit & { agent: unknown } = {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${access}`,
        },
        body: JSON.stringify({ instances, parameters }),
        agent,
      };
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

    const agent = this.buildProxyAgent(ctx);
    const access = await getSAAccessToken(sa, agent);
    const vertexModel = vertexGeminiModelFor(model.code);
    const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${sa.project_id}/locations/${VERTEX_LOCATION}/publishers/google/models/${encodeURIComponent(vertexModel)}:generateContent`;
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

  // Fail-secure: this provider must NEVER hit Google directly. Selector
  // (pickAccount) already filters out accounts without an active proxy via
  // ALWAYS_PROXY_REQUIRED_PROVIDERS, but defence-in-depth here ensures a
  // direct connection cannot leak even if the selector contract is violated
  // (e.g. someone passes a hand-rolled ctx in tests, or future refactor
  // bypasses the gate). Throws AdapterError → failAccount=true so the
  // account moves to INVALID_CREDENTIALS and health-cron retries later.
  private buildProxyAgent(ctx: AdapterContext): HttpsProxyAgent<string> {
    if (!ctx.proxy) {
      throw new AdapterError(
        'invalid_credentials',
        'google_banana requires an active proxy; account has none attached',
      );
    }
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
    } catch (err) {
      throw new AdapterError(
        'invalid_credentials',
        `failed to build proxy agent for google_banana: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Low-level POST → JSON. Maps Google HTTP errors → AdapterError but does
   * NOT inspect candidate content (no SAFETY/promptFeedback checks). Shared
   * by image (via callApi), text completion, and embeddings.
   *
   * `agent` is REQUIRED — google_banana must never hit Google directly.
   * buildProxyAgent() throws if no proxy is configured, so this signature
   * also documents the invariant at the type level.
   */
  private async callRawApi(
    url: string,
    body: unknown,
    agent: HttpsProxyAgent<string>,
    extraHeaders?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      const init: RequestInit & { agent: unknown } = {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...extraHeaders },
        body: JSON.stringify(body),
        agent,
      };
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
    agent: HttpsProxyAgent<string>,
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
  /**
   * Build the generateContent request body — shared by AI Studio (key auth)
   * and Vertex AI (SA bearer) paths since both use the same body shape.
   */
  private async buildTextGenerationBody(
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const contents = buildGeminiContents(params);
    // Vision: fold any input images (top-level `image`/`images` or image_url
    // parts in messages) into the first user content as inlineData parts.
    const imageParts = await collectGeminiImageParts(params);
    if (imageParts.length > 0) {
      let userContent = contents.find((c) => c.role === 'user');
      if (!userContent) {
        userContent = { role: 'user', parts: [] };
        contents.push(userContent);
      }
      userContent.parts = [...imageParts, ...userContent.parts];
    }
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
    applyResponseFormat(params, generationConfig);
    const body: Record<string, unknown> = { contents, generationConfig };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    const tools = buildTools(params);
    if (tools) body.tools = tools;
    const toolChoice = params['tool_choice'] ?? params['toolChoice'];
    if (toolChoice !== undefined) {
      body.toolConfig = buildToolConfig(toolChoice);
    }
    return body;
  }

  private extractTextGenerationMeta(
    response: GeminiResponse,
    modelCode: string,
  ): Record<string, unknown> {
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
      model: modelCode,
      usage: usage
        ? {
            input_tokens: usage.promptTokenCount ?? 0,
            output_tokens: usage.candidatesTokenCount ?? 0,
            total_tokens: usage.totalTokenCount ?? 0,
          }
        : null,
    };
    if (toolCalls.length > 0) meta.tool_calls = toolCalls;
    return meta;
  }

  private async executeTextGenerationVertex(
    ctx: AdapterContext,
    sa: ServiceAccountKey,
  ): Promise<AdapterResult> {
    const { model, params } = ctx;
    const body = await this.buildTextGenerationBody(params);
    // Vertex requires `role: "user"` on each content; AI Studio is lenient.
    // The contents already come with roles set from buildGeminiContents.
    const agent = this.buildProxyAgent(ctx);
    const access = await getSAAccessToken(sa, agent);
    const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${sa.project_id}/locations/${VERTEX_LOCATION}/publishers/google/models/${encodeURIComponent(model.code)}:generateContent`;
    const response = (await this.callRawApi(url, body, agent, {
      authorization: `Bearer ${access}`,
    })) as GeminiResponse;
    return { meta: this.extractTextGenerationMeta(response, model.code) };
  }

  private async executeTextGeneration(
    ctx: AdapterContext,
    apiKey: string,
  ): Promise<AdapterResult> {
    const { model, params } = ctx;
    const body = await this.buildTextGenerationBody(params);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.code)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const agent = this.buildProxyAgent(ctx);
    const response = (await this.callRawApi(url, body, agent)) as GeminiResponse;
    return { meta: this.extractTextGenerationMeta(response, model.code) };
  }

  // -----------------------------------------------------------------------
  // Text embedding — shared input parsing
  // -----------------------------------------------------------------------
  private parseEmbeddingInputs(
    params: Record<string, unknown>,
  ): {
    inputs: string[];
    taskType: string | undefined;
    title: string | undefined;
    outputDim: number | undefined;
  } {
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
    return { inputs, taskType, title, outputDim };
  }

  private async executeEmbeddingVertex(
    ctx: AdapterContext,
    sa: ServiceAccountKey,
  ): Promise<AdapterResult> {
    const { model, params } = ctx;
    const { inputs, taskType, title, outputDim } = this.parseEmbeddingInputs(params);

    // Vertex AI uses `:predict` with `instances=[{content, task_type, title}]`
    // — NOT the AI Studio `:embedContent`/`:batchEmbedContents` shape.
    const instances = inputs.map((text) => {
      const inst: Record<string, unknown> = { content: text };
      if (taskType) inst.task_type = taskType;
      if (title && taskType === 'RETRIEVAL_DOCUMENT') inst.title = title;
      return inst;
    });
    const parameters: Record<string, unknown> = {};
    if (typeof outputDim === 'number' && outputDim > 0) {
      parameters.outputDimensionality = outputDim;
    }
    const body: Record<string, unknown> = { instances };
    if (Object.keys(parameters).length > 0) body.parameters = parameters;

    const agent = this.buildProxyAgent(ctx);
    const access = await getSAAccessToken(sa, agent);
    const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${sa.project_id}/locations/${VERTEX_LOCATION}/publishers/google/models/${encodeURIComponent(model.code)}:predict`;
    const resp = (await this.callRawApi(url, body, agent, {
      authorization: `Bearer ${access}`,
    })) as {
      predictions?: Array<{ embeddings?: { values?: number[]; statistics?: unknown } }>;
    };

    const preds = resp.predictions ?? [];
    if (preds.length !== inputs.length) {
      throw new AdapterError(
        'unknown',
        `vertex returned ${preds.length} predictions for ${inputs.length} inputs`,
      );
    }
    const embeddings: number[][] = [];
    for (const p of preds) {
      const values = p.embeddings?.values;
      if (!Array.isArray(values)) {
        throw new AdapterError('unknown', 'vertex returned embedding without values');
      }
      embeddings.push(values);
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

  private async executeEmbedding(
    ctx: AdapterContext,
    apiKey: string,
  ): Promise<AdapterResult> {
    const { model, params } = ctx;
    const { inputs, taskType, title, outputDim } = this.parseEmbeddingInputs(params);

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
