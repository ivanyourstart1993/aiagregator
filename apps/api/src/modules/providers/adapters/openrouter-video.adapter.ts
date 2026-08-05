import { Injectable } from '@nestjs/common';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { StorageService } from '../../../common/storage/storage.service';
import {
  AdapterError,
  type AdapterContext,
  type AdapterFile,
  type AdapterResult,
  type ProviderAdapter,
} from './provider-adapter.interface';

// OpenRouter unified video-generation endpoint. One async LRO endpoint
// covers every routed model (Seedance 2.0 family, Veo, Kling, Sora, Wan).
// Submit → poll → download via signed URL embedded in the polling response.
//
// Two entry points share the logic below:
//  1. OpenRouterVideoAdapter — the standalone `openrouter-seedance-*` catalog
//     models (explicit OpenRouter selection).
//  2. The native SeedanceAdapter / KlingAiAdapter, which delegate here (via the
//     exported `submit/poll/validateOpenRouterAccount` helpers) whenever the
//     balancer hands them an account whose credentials are an OpenRouter key.
//     That lets an OpenRouter-keyed account live in the SAME `seedance` /
//     `kling_ai` provider pool as native accounts, so the balancer fails over
//     to OpenRouter when a native account runs out of balance.
// Keep in sync with apps/worker/src/adapters/openrouter-video.ts.
const SUPPORTED_MODELS = new Set([
  'openrouter-seedance-2-0',
  'openrouter-seedance-2-0-fast',
  'openrouter-seedance-1-5-pro',
]);
const SUPPORTED_METHODS = new Set([
  'text_to_video',
  'image_to_video',
  'first_last_frame_to_video',
]);

// Pull exactly two frame URLs for first_last_frame_to_video: prefer the
// `input_images` array ([0]=start, [1]=end); fall back to explicit
// first_frame_url / last_frame_url fields.
function pickFrameImages(
  p: Record<string, unknown>,
): { first?: string; last?: string } {
  const arr = Array.isArray(p['input_images'])
    ? (p['input_images'] as unknown[]).filter(
        (v): v is string => typeof v === 'string' && v.length > 0,
      )
    : [];
  const first =
    arr[0] ??
    pickString(p, 'first_frame_url', 'first_image', 'image', 'input_image');
  const last = arr[1] ?? pickString(p, 'last_frame_url', 'last_image');
  return { first, last };
}

// Catalog slugs are local (prefixed `openrouter-`) so multiple providers can
// expose the same upstream model under different routing rules. Translate to
// the canonical OpenRouter model ID at the adapter boundary.
const MODEL_CODE_TO_API_NAME: Record<string, string> = {
  'openrouter-seedance-2-0': 'bytedance/seedance-2.0',
  'openrouter-seedance-2-0-fast': 'bytedance/seedance-2.0-fast',
  'openrouter-seedance-1-5-pro': 'bytedance/seedance-1-5-pro',
};

// Seedance-2.0-fast has no 1080p tier on OpenRouter — clamp at the adapter so
// a stale catalog entry or an operator-set openrouterModel can't submit an
// unsupported size. Keyed by BOTH the local catalog slug (used by the
// standalone adapter) and the upstream id (used by delegated native requests).
const MODELS_WITHOUT_1080P = new Set([
  'openrouter-seedance-2-0-fast',
  'bytedance/seedance-2.0-fast',
]);

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
  usage?: Record<string, unknown>;
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

function pickResolution(p: Record<string, unknown>, modelKey: string): string {
  const v = pickString(p, 'resolution');
  if (v === '480p' || v === '720p' || v === '1080p') {
    if (v === '1080p' && MODELS_WITHOUT_1080P.has(modelKey)) return '720p';
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
  // Billing/quota BEFORE the 429/rate branch: OpenRouter (like Kling) can
  // return a balance/credit error with HTTP 429, and mis-classifying that as a
  // transient rate-limit would leave an out-of-credit account ACTIVE forever
  // instead of parking it (EXCLUDED_BY_BILLING) and failing over.
  if (/quota|exhaust/i.test(code) || /quota|exhaust/i.test(msg)) {
    return new AdapterError('quota', msg);
  }
  if (
    /billing|balance|credit|insufficient|payment/i.test(code) ||
    /billing|balance|insufficient|payment|not enough/i.test(msg)
  ) {
    return new AdapterError('billing', msg);
  }
  if (status === 429 || /rate/i.test(msg)) {
    const retryMs = retryAfter ? Number(retryAfter) * 1000 : undefined;
    return new AdapterError('rate_limit', msg, retryMs);
  }
  if (status >= 500) return new AdapterError('temporary', msg);
  if (/sensitive|content.?policy|moderation|safety|prohibit/i.test(code + ' ' + msg)) {
    return new AdapterError('content_rejected', msg);
  }
  if (/invalid/i.test(code) || /invalid|unsupported|required/i.test(msg)) {
    return new AdapterError('validation', msg);
  }
  return new AdapterError('unknown', msg);
}

function buildProxyAgent(
  proxy: AdapterContext['proxy'],
): HttpsProxyAgent<string> | undefined {
  if (!proxy) return undefined;
  const { protocol, host, port, login, password } = proxy;
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

async function openRouterCall(
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
      undefined,
      err,
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

async function openRouterDownload(
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

// ---------------------------------------------------------------------------
// Shared backend helpers — used by the standalone adapter AND by the native
// Seedance / Kling adapters for account-level (Variant B) failover.
// ---------------------------------------------------------------------------

// An account routes through OpenRouter when its credentials carry an OpenRouter
// key (`openrouterApiKey`) or an explicit `{ backend: 'openrouter' }` marker.
export function isOpenRouterAccount(
  c: Record<string, unknown> | undefined,
): boolean {
  if (!c) return false;
  if (c['backend'] === 'openrouter') return true;
  const k = c['openrouterApiKey'] ?? c['openrouter_api_key'];
  return typeof k === 'string' && k.length > 0;
}

export function extractOpenRouterApiKey(
  c: Record<string, unknown> | undefined,
): string {
  const v = extractOpenRouterApiKeyOrNull(c);
  if (!v) {
    throw new AdapterError(
      'invalid_credentials',
      'openrouter account credentials missing apiKey',
    );
  }
  return v;
}

function extractOpenRouterApiKeyOrNull(
  c: Record<string, unknown> | undefined,
): string | null {
  if (!c) return null;
  const v =
    (c['openrouterApiKey'] as string | undefined) ??
    (c['openrouter_api_key'] as string | undefined) ??
    (c['apiKey'] as string | undefined) ??
    (c['api_key'] as string | undefined) ??
    (c['key'] as string | undefined);
  return typeof v === 'string' && v.length > 0 ? v : null;
}

// Resolve the upstream OpenRouter model id for a delegated native request. We
// deliberately do NOT auto-map across versions — a `kling-v2-6` request must
// never silently become `kling-v3.0`. The operator sets
// `credentials.openrouterModel` per account (e.g. "kwaivgi/kling-v3.0-std" or
// "bytedance/seedance-2.0") and scopes the account with supportedModelIds so
// the balancer only picks it for models it can actually serve.
export function resolveOpenRouterModelId(
  nativeModelCode: string,
  c: Record<string, unknown> | undefined,
): string {
  const override =
    (c?.['openrouterModel'] as string | undefined) ??
    (c?.['openrouter_model'] as string | undefined);
  if (typeof override === 'string' && override.length > 0) return override;
  throw new AdapterError(
    'validation',
    `OpenRouter account is not configured for model "${nativeModelCode}": set ` +
      `credentials.openrouterModel (e.g. "kwaivgi/kling-v3.0-std" or ` +
      `"bytedance/seedance-2.0") and scope the account with supportedModelIds.`,
  );
}

// Build the POST /videos request body. `openrouterModel` is the already
// resolved upstream id; `methodCode` selects text/image/first-last-frame.
export function buildOpenRouterVideoBody(
  methodCode: string,
  params: Record<string, unknown>,
  openrouterModel: string,
): Record<string, unknown> {
  const prompt = pickString(params, 'prompt') ?? '';
  const isImageToVideo = methodCode === 'image_to_video';
  const isFirstLastFrame = methodCode === 'first_last_frame_to_video';
  if (!isImageToVideo && !isFirstLastFrame && !prompt) {
    throw new AdapterError(
      'validation',
      'text_to_video requires "prompt" parameter',
    );
  }
  const body: Record<string, unknown> = {
    model: openrouterModel,
    prompt,
    duration: pickDuration(params),
    resolution: pickResolution(params, openrouterModel),
    aspect_ratio: pickAspect(params),
  };
  if (isImageToVideo) {
    const fromArray = Array.isArray(params['input_images'])
      ? (params['input_images'] as unknown[]).find(
          (v): v is string => typeof v === 'string' && v.length > 0,
        )
      : undefined;
    const image =
      pickString(params, 'image', 'source_image', 'input_image', 'input_image_url') ??
      fromArray;
    if (!image) {
      throw new AdapterError(
        'validation',
        'image_to_video requires "image" / "input_images" (URL or data: URI)',
      );
    }
    body.frame_images = [
      { type: 'image_url', image_url: { url: image }, frame_type: 'first_frame' },
    ];
  } else if (isFirstLastFrame) {
    const { first, last } = pickFrameImages(params);
    if (!first || !last) {
      throw new AdapterError(
        'validation',
        'first_last_frame_to_video requires two images: "input_images" ' +
          '([0]=start, [1]=end) or "first_frame_url" + "last_frame_url"',
      );
    }
    body.frame_images = [
      { type: 'image_url', image_url: { url: first }, frame_type: 'first_frame' },
      { type: 'image_url', image_url: { url: last }, frame_type: 'last_frame' },
    ];
  }
  return body;
}

export async function submitOpenRouterVideo(args: {
  apiKey: string;
  agent: HttpsProxyAgent<string> | undefined;
  methodCode: string;
  params: Record<string, unknown>;
  openrouterModel: string;
}): Promise<AdapterResult> {
  const body = buildOpenRouterVideoBody(
    args.methodCode,
    args.params,
    args.openrouterModel,
  );
  const parsed = await openRouterCall(
    'POST',
    `${OPENROUTER_BASE}/videos`,
    args.apiKey,
    body,
    args.agent,
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

export async function pollOpenRouterVideo(args: {
  ctx: AdapterContext;
  providerJobId: string;
  apiKey: string;
  agent: HttpsProxyAgent<string> | undefined;
  storage: StorageService;
}): Promise<AdapterResult> {
  const { ctx, providerJobId, apiKey, agent, storage } = args;
  const url = `${OPENROUTER_BASE}/videos/${encodeURIComponent(providerJobId)}`;
  const parsed = await openRouterCall('GET', url, apiKey, undefined, agent);

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
    // unsigned_urls return content via the same OpenRouter endpoint and
    // require the Bearer token to download. signed_urls (if present) point
    // straight at the upstream CDN and are usable anonymously.
    const needsAuth = !parsed.signed_urls || parsed.signed_urls.length === 0;
    const downloaded = await openRouterDownload(
      firstUrl,
      needsAuth ? apiKey : undefined,
      agent,
    );
    const key = storage.buildResultKey({
      userId: ctx.userId,
      taskId: ctx.taskId,
      filename: 'video_0.mp4',
    });
    const uploaded = await storage.upload({
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
  // Unknown status — keep polling. OpenRouter may introduce new states.
  return { pending: true, providerJobId };
}

// Cheap credential probe used by the account-health cron. GET /models returns
// 401/403 for a bad key and 2xx otherwise.
export async function validateOpenRouterAccount(
  credentials: Record<string, unknown>,
  proxy?: AdapterContext['proxy'],
): Promise<{ ok: boolean; reason?: string }> {
  const apiKey = extractOpenRouterApiKeyOrNull(credentials);
  if (!apiKey) return { ok: false, reason: 'missing apiKey' };
  try {
    const agent = buildProxyAgent(proxy);
    const init: RequestInit & { agent?: unknown } = {
      method: 'GET',
      headers: { authorization: `Bearer ${apiKey}` },
    };
    if (agent) init.agent = agent;
    const res = await fetch(`${OPENROUTER_BASE}/models`, init);
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: `http ${res.status}` };
    }
    if (res.status >= 200 && res.status < 500) return { ok: true };
    return { ok: false, reason: `http ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

@Injectable()
export class OpenRouterVideoAdapter implements ProviderAdapter {
  // OpenRouter is used as a transparent routing layer for the Seedance 2.0
  // family; from the public catalog's perspective these models belong to
  // the `seedance` provider. The registry resolves between this adapter
  // and the BytePlus-direct SeedanceAdapter via the model-code allow-list
  // (`SUPPORTED_MODELS` — only the `openrouter-seedance-*` slugs land here).
  public readonly providerCode = 'seedance';

  constructor(private readonly storage: StorageService) {}

  supports(modelCode: string, methodCode: string): boolean {
    if (!SUPPORTED_MODELS.has(modelCode)) return false;
    if (!SUPPORTED_METHODS.has(methodCode)) return false;
    return true;
  }

  async validateAccount(
    credentials: Record<string, unknown>,
    proxy?: AdapterContext['proxy'],
  ): Promise<{ ok: boolean; reason?: string }> {
    return validateOpenRouterAccount(credentials, proxy);
  }

  async execute(ctx: AdapterContext): Promise<AdapterResult> {
    const apiKey = extractOpenRouterApiKey(ctx.account.credentials);
    const agent = buildProxyAgent(ctx.proxy);
    return submitOpenRouterVideo({
      apiKey,
      agent,
      methodCode: ctx.method.code,
      params: ctx.params,
      openrouterModel: realModelName(ctx.model.code),
    });
  }

  async pollOperation(
    ctx: AdapterContext,
    providerJobId: string,
  ): Promise<AdapterResult> {
    const apiKey = extractOpenRouterApiKey(ctx.account.credentials);
    const agent = buildProxyAgent(ctx.proxy);
    return pollOpenRouterVideo({
      ctx,
      providerJobId,
      apiKey,
      agent,
      storage: this.storage,
    });
  }
}
