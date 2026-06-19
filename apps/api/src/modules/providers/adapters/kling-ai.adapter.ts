import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { StorageService } from '../../../common/storage/storage.service';
import {
  AdapterError,
  type AdapterContext,
  type AdapterFile,
  type AdapterResult,
  type ProviderAdapter,
} from './provider-adapter.interface';

const SUPPORTED_MODELS = new Set([
  // Catalog "legacy" codes — kept for backward compatibility, mapped below.
  'kling-2.6',
  'kling-v3',
  // Real Kling API model_name values (preferred; pass through unchanged).
  'kling-v1-5',
  'kling-v1-6',
  'kling-v2-1-master',
  'kling-v2-5-turbo',
  'kling-v2-6',
]);
const SUPPORTED_METHODS = new Set([
  'text_to_video',
  'image_to_video',
  'motion_control',
  'lip_sync',
]);

const KLING_BASE = 'https://api-singapore.klingai.com';

const MODEL_CODE_TO_API_NAME: Record<string, string> = {
  'kling-2.6': 'kling-v2-6',
};

function realModelName(code: string): string {
  return MODEL_CODE_TO_API_NAME[code] ?? code;
}

interface KlingTaskResult {
  videos?: Array<{ url?: string; duration?: string | number }>;
}

interface KlingResponse {
  code?: number;
  message?: string;
  data?: {
    task_id?: string;
    task_status?: 'submitted' | 'processing' | 'succeed' | 'failed';
    task_status_msg?: string;
    task_result?: KlingTaskResult;
  };
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signKlingJwt(accessKey: string, secretKey: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5 };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signing = `${headerB64}.${payloadB64}`;
  const sig = base64url(
    createHmac('sha256', secretKey).update(signing).digest(),
  );
  return `${signing}.${sig}`;
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

// Kling API accepts mode='std'|'pro' — not 'standard'. We accept either
// from the caller (catalog uses 'standard') and translate before sending.
function pickMode(p: Record<string, unknown>): 'std' | 'pro' {
  const v = pickString(p, 'mode');
  return v === 'pro' ? 'pro' : 'std';
}

// Caller-fixable Kling parameter errors (wrong/invalid/out-of-range request
// fields). Includes the prompt length cap ("size must be between 0 and 2500").
const KLING_PARAM_ERROR_RE =
  /value\s+'[^']*'\s+is\s+invalid|must be between|size must be|too (?:long|short|large|small|many|few)|exceeds|out of range|invalid (?:length|format|value)|length must/i;

function classifyKlingError(
  status: number,
  body: KlingResponse,
  retryAfter?: string | null,
): AdapterError {
  const msg = body.message ?? `kling error status=${status}`;
  if (status === 401 || status === 403) {
    return new AdapterError('invalid_credentials', msg);
  }
  if (status === 429 || /rate/i.test(msg)) {
    const retryMs = retryAfter ? Number(retryAfter) * 1000 : undefined;
    return new AdapterError('rate_limit', msg, retryMs);
  }
  if (status >= 500) {
    return new AdapterError('temporary', msg);
  }
  if (/quota/i.test(msg)) return new AdapterError('quota', msg);
  if (/credit|balance|billing/i.test(msg)) return new AdapterError('billing', msg);
  // Param-level rejections from Kling have the shape:
  //   "model_name value 'kling-v3-0' is invalid"
  //   "mode value 'standard' is invalid"
  // These are NOT content-moderation failures — they mean our request body
  // disagrees with the API contract. Surface as 'validation' so the public
  // layer sanitises to `provider_rejected`.
  // Caller-fixable param errors (invalid/out-of-range fields, prompt length
  // cap "size must be between 0 and 2500" = code 1201). Surface as 'validation'
  // → public 'provider_rejected' ("check parameters"), not the generic
  // 'service_unavailable' that tells callers to retry the same bad input.
  if (body.code === 1201 || KLING_PARAM_ERROR_RE.test(msg)) {
    return new AdapterError('validation', msg);
  }
  if (/violation|safety|prohibit/i.test(msg)) {
    return new AdapterError('content_rejected', msg);
  }
  return new AdapterError('unknown', msg);
}

@Injectable()
export class KlingAiAdapter implements ProviderAdapter {
  public readonly providerCode = 'kling_ai';
  private readonly logger = new Logger(KlingAiAdapter.name);

  constructor(private readonly storage: StorageService) {}

  supports(modelCode: string, methodCode: string): boolean {
    return SUPPORTED_MODELS.has(modelCode) && SUPPORTED_METHODS.has(methodCode);
  }

  async validateAccount(
    credentials: Record<string, unknown>,
  ): Promise<{ ok: boolean; reason?: string }> {
    const accessKey =
      (credentials['accessKey'] as string | undefined) ??
      (credentials['access_key'] as string | undefined);
    const secretKey =
      (credentials['secretKey'] as string | undefined) ??
      (credentials['secret_key'] as string | undefined);
    if (!accessKey || !secretKey) {
      return { ok: false, reason: 'missing accessKey/secretKey' };
    }
    try {
      const token = signKlingJwt(accessKey, secretKey);
      // Hit a cheap endpoint — list with pageSize=1. Kling returns 200/JSON.
      const res = await fetch(
        `${KLING_BASE}/v1/videos/text2video?pageNum=1&pageSize=1`,
        { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      );
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

  async execute(ctx: AdapterContext): Promise<AdapterResult> {
    const creds = this.extractCreds(ctx);
    const token = signKlingJwt(creds.accessKey, creds.secretKey);
    const agent = this.buildProxyAgent(ctx);

    const { method, model, params } = ctx;

    if (method.code === 'motion_control') {
      return this.executeMotionControl(ctx, token, agent);
    }
    if (method.code === 'lip_sync') {
      return this.executeLipSync(ctx, token, agent);
    }

    const endpoint =
      method.code === 'image_to_video'
        ? `${KLING_BASE}/v1/videos/image2video`
        : `${KLING_BASE}/v1/videos/text2video`;

    const body: Record<string, unknown> = {
      model_name: realModelName(model.code),
      duration: pickDuration(params),
      mode: pickMode(params),
      aspect_ratio: pickString(params, 'aspect_ratio', 'aspectRatio') ?? '16:9',
    };
    const prompt = pickString(params, 'prompt');
    if (prompt) body.prompt = prompt;
    const negative = pickString(params, 'negative_prompt', 'negativePrompt');
    if (negative) body.negative_prompt = negative;

    if (method.code === 'image_to_video') {
      // Public schema requires `input_images: [url]` (array, 1-2 URLs);
      // older callers may send `image` / `source_image` / `input_image`
      // (single string). Accept both, prefer `input_images`.
      let image: string | undefined;
      const arr = params['input_images'];
      if (Array.isArray(arr)) {
        for (const v of arr) {
          if (typeof v === 'string' && v.length > 0) {
            image = v;
            break;
          }
        }
      }
      if (!image) {
        image = pickString(params, 'image', 'source_image', 'input_image');
      }
      if (!image) {
        throw new AdapterError(
          'validation',
          'image_to_video requires "input_images" (array of URLs) or "image" (single URL/base64)',
        );
      }
      body.image = image.startsWith('data:')
        ? image.replace(/^data:[^;]+;base64,/, '')
        : image;
    } else if (!prompt) {
      throw new AdapterError(
        'validation',
        'text_to_video requires "prompt" parameter',
      );
    }

    const parsed = await this.callApi('POST', endpoint, token, body, agent);
    const taskId = parsed.data?.task_id;
    if (!taskId) {
      throw new AdapterError(
        'unknown',
        `kling submit returned no task_id: ${JSON.stringify(parsed).slice(0, 300)}`,
      );
    }
    return { pending: true, providerJobId: taskId };
  }

  private async executeMotionControl(
    ctx: AdapterContext,
    token: string,
    agent: HttpsProxyAgent<string> | undefined,
  ): Promise<AdapterResult> {
    const { model, params } = ctx;

    const rawImage = pickString(
      params,
      'input_image',
      'image_url',
      'image',
      'source_image',
    );
    if (!rawImage) {
      throw new AdapterError(
        'validation',
        'motion_control requires "input_image" (character image URL or base64)',
      );
    }
    const video = pickString(params, 'reference_video', 'video_url', 'video');
    if (!video) {
      throw new AdapterError(
        'validation',
        'motion_control requires "reference_video" (motion source video URL)',
      );
    }

    const orientation =
      pickString(params, 'character_orientation') === 'image'
        ? 'image'
        : 'video';
    // keep_original_sound defaults to true; Kling expects the string yes|no.
    const keepSound = params['keep_original_sound'] === false ? 'no' : 'yes';

    const body: Record<string, unknown> = {
      model_name: realModelName(model.code),
      mode: pickMode(params),
      image_url: rawImage.startsWith('data:')
        ? rawImage.replace(/^data:[^;]+;base64,/, '')
        : rawImage,
      video_url: video,
      character_orientation: orientation,
      keep_original_sound: keepSound,
    };
    const prompt = pickString(params, 'prompt');
    if (prompt) body.prompt = prompt;

    const endpoint = `${KLING_BASE}/v1/videos/motion-control`;
    const parsed = await this.callApi('POST', endpoint, token, body, agent);
    const taskId = parsed.data?.task_id;
    if (!taskId) {
      throw new AdapterError(
        'unknown',
        `kling motion-control submit returned no task_id: ${JSON.stringify(parsed).slice(0, 300)}`,
      );
    }
    return { pending: true, providerJobId: taskId };
  }

  private async executeLipSync(
    ctx: AdapterContext,
    token: string,
    agent: HttpsProxyAgent<string> | undefined,
  ): Promise<AdapterResult> {
    const { params } = ctx;

    const rawMode = pickString(params, 'mode');
    const mode =
      rawMode === 'audio2video'
        ? 'audio2video'
        : rawMode === 'text2video'
          ? 'text2video'
          : undefined;
    if (!mode) {
      throw new AdapterError(
        'validation',
        'lip_sync requires "mode" = "text2video" or "audio2video"',
      );
    }

    // Kling wraps lip-sync params in an `input` object (unlike the flat
    // body of text2video/image2video/motion-control).
    const input: Record<string, unknown> = { mode };

    const videoId = pickString(params, 'video_id');
    const videoUrl = pickString(params, 'input_video', 'video_url', 'video');
    if (videoId) {
      input.video_id = videoId;
    } else if (videoUrl) {
      input.video_url = videoUrl;
    } else {
      throw new AdapterError(
        'validation',
        'lip_sync requires "input_video" (source video URL) or "video_id"',
      );
    }

    if (mode === 'text2video') {
      const text = pickString(params, 'text');
      if (!text) {
        throw new AdapterError(
          'validation',
          'lip_sync text2video requires "text"',
        );
      }
      const voiceId = pickString(params, 'voice_id');
      if (!voiceId) {
        throw new AdapterError(
          'validation',
          'lip_sync text2video requires "voice_id"',
        );
      }
      input.text = text;
      input.voice_id = voiceId;
      input.voice_language =
        pickString(params, 'voice_language') === 'zh' ? 'zh' : 'en';
      const speed = Number(params['voice_speed']);
      input.voice_speed =
        Number.isFinite(speed) && speed >= 0.8 && speed <= 2 ? speed : 1.0;
    } else {
      const audioUrl = pickString(params, 'audio_url', 'audio');
      if (!audioUrl) {
        throw new AdapterError(
          'validation',
          'lip_sync audio2video requires "audio_url"',
        );
      }
      input.audio_type = 'url';
      input.audio_url = audioUrl;
    }

    const body: Record<string, unknown> = { input };
    const callback = pickString(params, 'callback_url');
    if (callback) body.callback_url = callback;

    const endpoint = `${KLING_BASE}/v1/videos/lip-sync`;
    const parsed = await this.callApi('POST', endpoint, token, body, agent);
    const taskId = parsed.data?.task_id;
    if (!taskId) {
      throw new AdapterError(
        'unknown',
        `kling lip-sync submit returned no task_id: ${JSON.stringify(parsed).slice(0, 300)}`,
      );
    }
    return { pending: true, providerJobId: taskId };
  }

  async pollOperation(
    ctx: AdapterContext,
    providerJobId: string,
  ): Promise<AdapterResult> {
    const creds = this.extractCreds(ctx);
    const token = signKlingJwt(creds.accessKey, creds.secretKey);
    const agent = this.buildProxyAgent(ctx);

    const path =
      ctx.method.code === 'motion_control'
        ? 'motion-control'
        : ctx.method.code === 'lip_sync'
          ? 'lip-sync'
          : ctx.method.code === 'image_to_video'
            ? 'image2video'
            : 'text2video';
    const url = `${KLING_BASE}/v1/videos/${path}/${encodeURIComponent(providerJobId)}`;

    const parsed = await this.callApi('GET', url, token, undefined, agent);
    const status = parsed.data?.task_status;
    if (status === 'submitted' || status === 'processing') {
      return { pending: true, providerJobId };
    }
    if (status === 'failed') {
      const msg = parsed.data?.task_status_msg ?? 'kling task failed';
      if (/credit|balance|billing/i.test(msg)) {
        throw new AdapterError('billing', msg);
      }
      if (/quota/i.test(msg)) throw new AdapterError('quota', msg);
      if (KLING_PARAM_ERROR_RE.test(msg)) {
        throw new AdapterError('validation', msg);
      }
      if (/violation|safety|prohibit|reject/i.test(msg)) {
        throw new AdapterError('content_rejected', msg);
      }
      throw new AdapterError('unknown', msg);
    }
    if (status === 'succeed') {
      const videos = parsed.data?.task_result?.videos ?? [];
      if (videos.length === 0 || !videos[0]?.url) {
        throw new AdapterError('unknown', 'kling task succeed but no video URL');
      }
      const files: AdapterFile[] = [];
      for (let i = 0; i < videos.length; i++) {
        const v = videos[i]!;
        if (!v.url) continue;
        const downloaded = await this.downloadVideo(v.url, agent);
        const key = this.storage.buildResultKey({
          userId: ctx.userId,
          taskId: ctx.taskId,
          filename: `video_${i}.mp4`,
        });
        const uploaded = await this.storage.upload({
          key,
          body: downloaded.body,
          contentType: downloaded.mimeType,
        });
        const dur =
          typeof v.duration === 'number'
            ? v.duration
            : typeof v.duration === 'string'
              ? Number(v.duration) || undefined
              : undefined;
        files.push({
          url: uploaded.url,
          mimeType: downloaded.mimeType,
          bucket: uploaded.bucket,
          key: uploaded.key,
          size: uploaded.size,
          fileType: 'video',
          durationSeconds: dur,
        });
      }
      return { files, pending: false };
    }
    return { pending: true, providerJobId };
  }

  private extractCreds(ctx: AdapterContext): { accessKey: string; secretKey: string } {
    const c = ctx.account.credentials ?? {};
    const accessKey =
      (c['access_key'] as string | undefined) ??
      (c['accessKey'] as string | undefined) ??
      (c['ak'] as string | undefined);
    const secretKey =
      (c['secret_key'] as string | undefined) ??
      (c['secretKey'] as string | undefined) ??
      (c['sk'] as string | undefined);
    if (!accessKey || !secretKey) {
      throw new AdapterError(
        'invalid_credentials',
        'kling_ai account credentials missing access_key/secret_key',
      );
    }
    return { accessKey, secretKey };
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
    try {
      return new HttpsProxyAgent(`${scheme}://${auth}${host}:${port}`);
    } catch (err) {
      this.logger.warn(
        `failed to build proxy agent: ${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    }
  }

  private async callApi(
    httpMethod: 'GET' | 'POST',
    url: string,
    token: string,
    body: unknown,
    agent: HttpsProxyAgent<string> | undefined,
  ): Promise<KlingResponse> {
    let res: Response;
    try {
      const init: RequestInit & { agent?: unknown } = {
        method: httpMethod,
        headers: {
          authorization: `Bearer ${token}`,
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
        `network error calling kling: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        err,
      );
    }
    const text = await res.text();
    let parsed: KlingResponse = {};
    try {
      parsed = text ? (JSON.parse(text) as KlingResponse) : {};
    } catch {
      parsed = {};
    }
    if (!res.ok) {
      throw classifyKlingError(res.status, parsed, res.headers.get('retry-after'));
    }
    if (typeof parsed.code === 'number' && parsed.code !== 0) {
      throw classifyKlingError(200, parsed, null);
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
        `failed to download kling video: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!res.ok) {
      throw new AdapterError(
        'temporary',
        `failed to download kling video: status=${res.status}`,
      );
    }
    const mimeType = res.headers.get('content-type') ?? 'video/mp4';
    const buf = Buffer.from(await res.arrayBuffer());
    return { body: buf, mimeType };
  }
}
