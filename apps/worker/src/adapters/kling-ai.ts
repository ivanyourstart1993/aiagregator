import { createHmac } from 'node:crypto';
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

interface KlingResponse {
  code?: number;
  message?: string;
  data?: {
    task_id?: string;
    task_status?: 'submitted' | 'processing' | 'succeed' | 'failed';
    task_status_msg?: string;
    task_result?: {
      videos?: Array<{ url?: string; duration?: string | number }>;
    };
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

/**
 * Recognise Kling rejections caused by the caller's reference video /
 * character image not meeting the API's limits, and return a clear,
 * customer-facing message. Returns null if `msg` is not a media-limit
 * rejection (so the caller falls through to the next classifier).
 *
 * Kling's terse strings ("Video duration can not less than 3s") are
 * rewritten into actionable guidance that also states the full constraint,
 * so the user knows the valid range — not just that they're outside it.
 */
function describeKlingMediaError(msg: string): string | null {
  const m = msg.toLowerCase();
  // Duration — too short
  if (/duration.*(less than|can ?not.*less|too short|below)/.test(m)) {
    return 'Reference video is too short. It must be 3–30 seconds long (3–10 seconds when character orientation is "image").';
  }
  // Duration — too long
  if (/duration.*(more than|can ?not.*more|exceed|too long|longer than|above)/.test(m)) {
    return 'Reference video is too long. It must be 3–30 seconds long (3–10 seconds when character orientation is "image").';
  }
  // Generic duration complaint we couldn't bucket as short/long
  if (/duration/.test(m) && /video|reference|clip/.test(m)) {
    return 'Reference video duration is out of range. It must be 3–30 seconds long (3–10 seconds when character orientation is "image").';
  }
  // File too large
  if (/(file )?size|too large|exceeds.*(\d+\s*mb|limit)|\d+\s*mb/.test(m) && /video|file|upload/.test(m)) {
    return 'Reference video file is too large. The maximum size is 100MB.';
  }
  // Unsupported format / codec
  if (/(format|codec|file type).*(not |un)support|unsupported.*(format|codec|video)|invalid.*format/.test(m)) {
    return 'Reference video format is not supported. Please upload an .mp4 or .mov file.';
  }
  // Resolution / dimensions of the character image or video
  if (/resolution|width|height|dimension|pixel|too small|too large/.test(m) && /image|video/.test(m)) {
    return 'Your image or video resolution is not supported by motion control. Please use a clearer source file.';
  }
  return null;
}

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
  if (status >= 500) return new AdapterError('temporary', msg);
  if (/quota/i.test(msg)) return new AdapterError('quota', msg);
  if (/credit|balance|billing/i.test(msg)) return new AdapterError('billing', msg);
  // Caller's media doesn't meet Kling's requirements for the reference
  // video / character image. These are USER-fixable — the customer must
  // upload a different file — so we surface 'invalid_input' (→ public
  // `invalid_parameter`, message passed through verbatim) with a clear,
  // actionable string. Critically these are NOT retried: the old generic
  // `service_unavailable` told users to "retry shortly", so they hammered
  // the same too-short clip dozens of times. Kling's documented limits:
  // reference video 3–30s (3–10s in image-orientation mode), .mp4/.mov,
  // max 100MB.
  const mediaError = describeKlingMediaError(msg);
  if (mediaError) {
    return new AdapterError('invalid_input', mediaError);
  }
  // Param-level rejections from Kling have the shape:
  //   "model_name value 'kling-v3-0' is invalid"
  //   "mode value 'standard' is invalid"
  // These are NOT content-moderation failures — they mean our request body
  // disagrees with the API contract. Surface as 'validation' so the public
  // layer sanitises to `provider_rejected`.
  if (/value\s+'[^']*'\s+is\s+invalid/i.test(msg)) {
    return new AdapterError('validation', msg);
  }
  if (/violation|safety|prohibit/i.test(msg)) {
    return new AdapterError('content_rejected', msg);
  }
  return new AdapterError('unknown', msg);
}

export class KlingAiAdapter implements ProviderAdapter {
  public readonly providerCode = 'kling_ai';

  constructor(private readonly storage: WorkerStorage) {}

  supports(modelCode: string, methodCode: string): boolean {
    return SUPPORTED_MODELS.has(modelCode) && SUPPORTED_METHODS.has(methodCode);
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

    // Source video: a prior Kling video id, or any hosted clip URL.
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
      const pollMediaError = describeKlingMediaError(msg);
      if (pollMediaError) {
        throw new AdapterError('invalid_input', pollMediaError);
      }
      if (/value\s+'[^']*'\s+is\s+invalid/i.test(msg)) {
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
        const key = this.storage.buildKey({
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
