// Google Veo 3 / 3.1 video generation adapter (Vertex AI flavor).
//
// Async / long-running flow:
//   1. `execute(ctx)` POSTs to ${VERTEX}/{model}:predictLongRunning and returns
//      `{ pending: true, providerJobId: 'projects/.../operations/xxx' }`.
//      The worker stores providerJobId on Task & ProviderAttempt and returns.
//   2. `pollOperation(ctx, operationName)` POSTs to {model}:fetchPredictOperation
//      with `{ operationName }`. While `done=false` it returns
//      `{ pending: true }`. On `done=true` it downloads video bytes (or
//      reads inline base64), uploads to MinIO via StorageService, and
//      returns `{ files }`.
//
// Auth: per-account ServiceAccount JSON → cached OAuth2 access token via
// `getServiceAccountAccessToken` (cloud-platform scope). All HTTP calls
// (predict + fetch + GCS download) carry `Authorization: Bearer …`.
//
// Pricing (PER_SECOND) is applied at reservation/capture time by the
// pricing engine — the adapter only reports `durationSeconds` per file so
// that capture math can use actual seconds.
import { Injectable, Logger } from '@nestjs/common';
import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  extractServiceAccount,
  getServiceAccountAccessToken,
  safeFetchAsBase64,
  type ServiceAccountKey,
} from '@aiagg/shared';
import { StorageService } from '../../../common/storage/storage.service';
import {
  AdapterError,
  type AdapterContext,
  type AdapterFile,
  type AdapterResult,
  type ProviderAdapter,
} from './provider-adapter.interface';

const SUPPORTED_MODELS = new Set([
  'veo-3.0-generate-001',
  'veo-3.0-fast-generate-001',
  'veo-3.1-generate-preview',
  'veo-3.1-fast-generate-preview',
  'veo-3.1-lite-generate-preview',
]);

const SUPPORTED_METHODS = new Set([
  'text_to_video',
  'image_to_video',
  // Stretch — submitted with the same predictLongRunning shape; provider
  // may reject if model doesn't actually support these.
  'video_extend',
  'first_last_frame_to_video',
  'video_to_video',
]);

const DEFAULT_REGION =
  process.env.VERTEX_AI_VEO_REGION ?? 'us-central1';

// Vertex AI returns the video sample in a few different shapes depending on
// the model version and whether bytes are inlined or stored in GCS:
//   - Generative Language API legacy: response.generateVideoResponse.generatedSamples[i].video.{uri,bytesBase64Encoded}
//   - Vertex Veo 3 (current):         response.videos[i].{uri,gcsUri,bytesBase64Encoded,mimeType}
//   - Some Vertex builds wrap as:     response.videos[i].video.{...}
// We accept all three by lifting the fields off `sample` OR `sample.video`.
interface VideoLike {
  uri?: string;
  gcsUri?: string;
  bytesBase64Encoded?: string;
  mimeType?: string;
  video?: VideoLike;
}

interface VeoOperation {
  name?: string;
  done?: boolean;
  error?: { code?: number; message?: string; status?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: VideoLike[];
    };
    videos?: VideoLike[];
    raiMediaFilteredCount?: number;
  };
}

function extractVideoFields(s: VideoLike): {
  uri?: string;
  gcsUri?: string;
  bytesBase64Encoded?: string;
  mimeType?: string;
} {
  // Prefer nested `s.video` if present, else read directly off `s`.
  const inner = s.video ?? s;
  return {
    uri: inner.uri,
    gcsUri: inner.gcsUri,
    bytesBase64Encoded: inner.bytesBase64Encoded,
    mimeType: inner.mimeType,
  };
}

interface VeoErrorBody {
  error?: { code?: number; message?: string; status?: string };
}

function pickString(p: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function pickInt(p: Record<string, unknown>, def: number, ...keys: string[]): number {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      return Math.trunc(v);
    }
  }
  return def;
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
      `failed to fetch source media: ${msg}`,
    );
  }
}

async function readMaybeBase64(
  v: unknown,
): Promise<{ data: string; mimeType: string } | null> {
  if (typeof v !== 'string' || v.length === 0) return null;
  if (v.startsWith('data:')) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(v);
    if (m) return { mimeType: m[1]!, data: m[2]! };
    return null;
  }
  if (/^https?:\/\//.test(v)) return await fetchAsBase64(v);
  return null;
}

function buildVertexUrl(
  projectId: string,
  modelCode: string,
  op: 'predictLongRunning' | 'fetchPredictOperation',
): string {
  const region = DEFAULT_REGION;
  return `https://${region}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(
    projectId,
  )}/locations/${region}/publishers/google/models/${encodeURIComponent(modelCode)}:${op}`;
}

@Injectable()
export class GoogleVeoAdapter implements ProviderAdapter {
  public readonly providerCode = 'google_veo';
  private readonly logger = new Logger(GoogleVeoAdapter.name);

  constructor(private readonly storage: StorageService) {}

  supports(modelCode: string, methodCode: string): boolean {
    return SUPPORTED_MODELS.has(modelCode) && SUPPORTED_METHODS.has(methodCode);
  }

  async validateAccount(
    credentials: Record<string, unknown>,
  ): Promise<{ ok: boolean; reason?: string }> {
    const sa = extractServiceAccount(credentials);
    if (!sa) return { ok: false, reason: 'missing serviceAccount' };
    try {
      await getServiceAccountAccessToken(sa);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async execute(ctx: AdapterContext): Promise<AdapterResult> {
    const sa = extractServiceAccount(ctx.account.credentials ?? {});
    if (!sa) {
      throw new AdapterError(
        'invalid_credentials',
        'google_veo account credentials missing serviceAccount',
      );
    }
    const accessToken = await this.getAccessToken(sa);

    const { method, model, params } = ctx;
    const agent = this.buildProxyAgent(ctx);

    const prompt = pickString(params, 'prompt') ?? '';
    const aspect = pickString(params, 'aspect_ratio', 'aspectRatio');
    const resolution = pickString(params, 'resolution') ?? '1080p';
    const duration = pickInt(params, 8, 'duration_seconds', 'durationSeconds');
    const sampleCount = pickInt(params, 1, 'videos_count', 'videosCount', 'sampleCount');

    const instance: Record<string, unknown> = {};
    if (prompt) instance.prompt = prompt;

    if (method.code === 'image_to_video') {
      const imgVal =
        params['input_image_url'] ??
        params['image'] ??
        params['source_image'] ??
        params['input_image'];
      const inline = await readMaybeBase64(imgVal);
      if (!inline) {
        throw new AdapterError(
          'validation',
          'image_to_video requires input_image_url (https or data: URL)',
        );
      }
      instance.image = {
        bytesBase64Encoded: inline.data,
        mimeType: inline.mimeType,
      };
    } else if (
      method.code === 'first_last_frame_to_video' ||
      method.code === 'video_extend' ||
      method.code === 'video_to_video'
    ) {
      // Stretch shapes — pass-through whatever URL fields are present.
      const first = await readMaybeBase64(params['first_frame_url']);
      const last = await readMaybeBase64(params['last_frame_url']);
      const video = await readMaybeBase64(params['input_video_url']);
      if (first) instance.firstFrame = { bytesBase64Encoded: first.data, mimeType: first.mimeType };
      if (last) instance.lastFrame = { bytesBase64Encoded: last.data, mimeType: last.mimeType };
      if (video) instance.video = { bytesBase64Encoded: video.data, mimeType: video.mimeType };
    }

    const parameters: Record<string, unknown> = {
      durationSeconds: duration,
      resolution,
      sampleCount,
    };
    if (aspect) parameters.aspectRatio = aspect;

    const url = buildVertexUrl(sa.project_id, model.code, 'predictLongRunning');
    const body = { instances: [instance], parameters };

    const operation = await this.callApi(url, 'POST', body, accessToken, agent);
    const opName = operation.name;
    if (!opName) {
      throw new AdapterError(
        'unknown',
        'google_veo: predictLongRunning returned no operation name',
      );
    }
    return {
      pending: true,
      providerJobId: opName,
      meta: { durationSeconds: duration, resolution, sampleCount, aspectRatio: aspect ?? null },
    };
  }

  async pollOperation(
    ctx: AdapterContext,
    operationName: string,
  ): Promise<AdapterResult> {
    const sa = extractServiceAccount(ctx.account.credentials ?? {});
    if (!sa) {
      throw new AdapterError(
        'invalid_credentials',
        'google_veo account credentials missing serviceAccount',
      );
    }
    const accessToken = await this.getAccessToken(sa);
    const agent = this.buildProxyAgent(ctx);

    // Pull the model code out of the LRO name — Vertex names are of the form
    //   projects/{p}/locations/{r}/publishers/google/models/{model}/operations/{op}
    // so we can use it without holding extra state on the Task. Falls back to
    // ctx.model.code if parsing fails.
    const modelCode =
      /\/models\/([^/]+)\/operations\//.exec(operationName)?.[1] ??
      ctx.model.code;

    const url = buildVertexUrl(sa.project_id, modelCode, 'fetchPredictOperation');
    const op = await this.callApi(
      url,
      'POST',
      { operationName },
      accessToken,
      agent,
    );
    if (!op.done) return { pending: true, providerJobId: operationName };

    if (op.error) {
      const status = op.error.status ?? '';
      const message = op.error.message ?? `operation failed: ${operationName}`;
      if (/PERMISSION|UNAUTHENTICATED/.test(status)) {
        throw new AdapterError('invalid_credentials', message);
      }
      if (/RESOURCE_EXHAUSTED|QUOTA/i.test(status)) {
        throw new AdapterError('quota', message);
      }
      if (/INVALID_ARGUMENT/.test(status)) {
        throw new AdapterError('validation', message);
      }
      if (/SAFETY|BLOCKED/i.test(status) || /safety|blocked/i.test(message)) {
        throw new AdapterError('content_rejected', message);
      }
      throw new AdapterError('unknown', message);
    }

    const samples: VideoLike[] =
      op.response?.generateVideoResponse?.generatedSamples ??
      op.response?.videos ??
      [];
    if (!samples || samples.length === 0) {
      // Surface the raw response shape so an operator can adjust the parser
      // if Google ships another variant. Truncated to fit in errorMessage.
      const rawSnippet = JSON.stringify(op.response ?? {}).slice(0, 500);
      throw new AdapterError(
        'content_rejected',
        `google_veo: operation done but returned no videos (likely safety-filtered or unknown shape). response=${rawSnippet}`,
      );
    }

    const durationSeconds = pickInt(
      ctx.params,
      8,
      'duration_seconds',
      'durationSeconds',
    );

    const files: AdapterFile[] = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      const v = extractVideoFields(s);
      let bytes: Buffer | null = null;
      let mimeType = v.mimeType ?? 'video/mp4';
      if (v.bytesBase64Encoded) {
        bytes = Buffer.from(v.bytesBase64Encoded, 'base64');
      } else {
        const dlUri = v.gcsUri ?? v.uri;
        if (dlUri) {
          // Vertex returns either gs:// (private bucket) or https://...
          // googleapis.com URI. Both require the Bearer token to download.
          const httpsUri = dlUri.startsWith('gs://')
            ? `https://storage.googleapis.com/storage/v1/b/${dlUri
                .slice(5)
                .replace(/\/(.*)$/, '/o/$1')}?alt=media`
            : dlUri;
          const init: RequestInit & { agent?: unknown } = {
            headers: { authorization: `Bearer ${accessToken}` },
          };
          if (agent) init.agent = agent;
          const res = await fetch(httpsUri, init);
          if (!res.ok) {
            throw new AdapterError(
              'temporary',
              `failed to download veo video (${res.status})`,
            );
          }
          mimeType = res.headers.get('content-type') ?? mimeType;
          bytes = Buffer.from(await res.arrayBuffer());
        }
      }
      if (!bytes) {
        const sampleSnippet = JSON.stringify(s).slice(0, 400);
        throw new AdapterError(
          'unknown',
          `google_veo: sample ${i} has neither uri nor bytesBase64Encoded — sample=${sampleSnippet}`,
        );
      }
      const key = this.storage.buildResultKey({
        userId: ctx.userId,
        taskId: ctx.taskId,
        filename: `video_${i}.mp4`,
      });
      const uploaded = await this.storage.upload({
        key,
        body: bytes,
        contentType: mimeType,
      });
      files.push({
        url: uploaded.url,
        mimeType,
        bucket: uploaded.bucket,
        key: uploaded.key,
        size: uploaded.size,
        fileType: 'video',
        durationSeconds,
      });
    }
    return { files, providerJobId: operationName };
  }

  private async getAccessToken(sa: ServiceAccountKey): Promise<string> {
    try {
      return await getServiceAccountAccessToken(sa);
    } catch (err) {
      throw new AdapterError(
        'invalid_credentials',
        err instanceof Error ? err.message : String(err),
      );
    }
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
        `failed to construct proxy agent: ${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    }
  }

  private async callApi(
    url: string,
    httpMethod: 'GET' | 'POST',
    body: unknown,
    accessToken: string,
    agent: HttpsProxyAgent<string> | undefined,
  ): Promise<VeoOperation> {
    let res: Response;
    try {
      const init: RequestInit & { agent?: unknown } = {
        method: httpMethod,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
      };
      if (httpMethod === 'POST') init.body = JSON.stringify(body ?? {});
      if (agent) init.agent = agent;
      res = await fetch(url, init);
    } catch (err) {
      throw new AdapterError(
        'temporary',
        `network error calling google_veo: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        err,
      );
    }
    const text = await res.text();
    let parsed: VeoOperation & VeoErrorBody;
    try {
      parsed = text ? (JSON.parse(text) as VeoOperation & VeoErrorBody) : {};
    } catch {
      parsed = {} as VeoOperation;
    }
    if (!res.ok) {
      const status = res.status;
      const message =
        parsed.error?.message ??
        `google_veo returned status ${status}: ${text.slice(0, 500)}`;
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
    return parsed;
  }
}
