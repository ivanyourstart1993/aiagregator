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

const SUPPORTED_IMAGE_MODELS = new Set([
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
  // Imagen on Vertex (Service Account only). text_to_image only — Imagen
  // edit uses a different request shape we don't model in this adapter.
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
  functionCall?: {
    name: string;
    args?: Record<string, unknown>;
  };
}

interface GeminiContent {
  role?: string;
  parts?: GeminiPart[];
}

interface GeminiCandidate {
  content?: GeminiContent;
  finishReason?: string;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: GeminiUsageMetadata;
  error?: {
    code?: number;
    status?: string;
    message?: string;
  };
}

interface GeminiEmbeddingResponse {
  embedding?: { values?: number[] };
  embeddings?: Array<{ values?: number[] }>;
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

// --- Gemini text helpers ---------------------------------------------------

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
      // 'system' is hoisted to systemInstruction (handled separately).
      if (role === 'system') continue;
      const geminiRole: 'user' | 'model' = role === 'assistant' ? 'model' : 'user';
      const content = m['content'];
      const parts: GeminiMessageContent['parts'] = [];
      if (typeof content === 'string') {
        parts.push({ text: content });
      } else if (Array.isArray(content)) {
        for (const item of content) {
          if (!item || typeof item !== 'object') continue;
          const it = item as Record<string, unknown>;
          if (it['type'] === 'text' && typeof it['text'] === 'string') {
            parts.push({ text: it['text'] as string });
          }
          // image_url -> inlineData would require fetching; for v1 we skip
          // image content in text-mode messages (Gemini text models accept
          // image inputs but our text method docs don't promise it).
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
  // Also lift any role:system messages from the messages array.
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

// Normalise one image input into a Gemini inlineData part. Accepts a data:
// URI / https:// URL string, an object { type:"base64", media_type, data } or
// { type:"url", url } / { url }, or an OpenAI chat image part { image_url:{url} }.
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
  const single = params['image'] ?? params['source_image'] ?? params['input_image'];
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

async function collectGeminiImageParts(
  params: Record<string, unknown>,
): Promise<InlineImagePart[]> {
  const fromParams = await buildInlineImages(params);
  const fromMessages = await imagePartsFromMessages(params);
  return [...fromParams, ...fromMessages];
}

// Translate an OpenAI-style `response_format` into Gemini's generationConfig.
// No-op if responseSchema was already set (native response_schema wins).
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

@Injectable()
export class GoogleBananaAdapter implements ProviderAdapter {
  public readonly providerCode = 'google_banana';
  private readonly logger = new Logger(GoogleBananaAdapter.name);

  constructor(private readonly storage: StorageService) {}

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
    const apiKey = this.extractApiKey(ctx);
    if (!apiKey) {
      throw new AdapterError(
        'invalid_credentials',
        'google_banana account credentials missing apiKey',
      );
    }
    if (SUPPORTED_EMBEDDING_METHODS.has(ctx.method.code)) {
      return this.executeEmbedding(ctx, apiKey);
    }
    if (SUPPORTED_TEXT_METHODS.has(ctx.method.code)) {
      return this.executeTextGeneration(ctx, apiKey);
    }
    return this.executeImage(ctx, apiKey);
  }

  private async executeImage(
    ctx: AdapterContext,
    apiKey: string,
  ): Promise<AdapterResult> {
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

  // -----------------------------------------------------------------------
  // Text generation (Gemini 2.5 chat completion / structured output / tools)
  // -----------------------------------------------------------------------
  private async executeTextGeneration(
    ctx: AdapterContext,
    apiKey: string,
  ): Promise<AdapterResult> {
    const { model, params } = ctx;
    const contents = buildGeminiContents(params);
    // Vision: fold input images (top-level image/images or message image_url
    // parts) into the first user content as inlineData parts.
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

    const body: Record<string, unknown> = {
      contents,
      generationConfig,
    };
    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }
    const tools = buildTools(params);
    if (tools) body.tools = tools;
    const toolChoice = params['tool_choice'] ?? params['toolChoice'];
    if (toolChoice !== undefined) {
      body.toolConfig = buildToolConfig(toolChoice);
    }

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.code)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const dispatcher = this.buildProxyAgent(ctx);
    const response = await this.callApi(url, body, dispatcher);

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
      throw new AdapterError('validation', 'embedding input must be a non-empty string or array of strings');
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

    const dispatcher = this.buildProxyAgent(ctx);
    const embeddings: number[][] = [];

    if (inputs.length === 1) {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.code)}:embedContent?key=${encodeURIComponent(apiKey)}`;
      const single = buildRequest(inputs[0]!);
      // single-content endpoint doesn't accept `model` in body
      delete single.model;
      const resp = (await this.callRawApi(
        url,
        single,
        dispatcher,
      )) as GeminiEmbeddingResponse;
      const values = resp.embedding?.values;
      if (!Array.isArray(values)) {
        throw new AdapterError('unknown', 'google returned no embedding values');
      }
      embeddings.push(values);
    } else {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.code)}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`;
      const body = { requests: inputs.map((t) => buildRequest(t)) };
      const resp = (await this.callRawApi(
        url,
        body,
        dispatcher,
      )) as GeminiEmbeddingResponse;
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
    // Fallback: credentials may be the plain Service Account JSON itself
    // (no wrapper key) — same shape Google Cloud downloads.
    if (raw === undefined) {
      if (
        credentials['type'] === 'service_account' ||
        (typeof credentials['client_email'] === 'string' &&
          typeof credentials['private_key'] === 'string' &&
          typeof credentials['project_id'] === 'string')
      ) {
        raw = credentials;
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

  /**
   * Low-level POST → JSON. Maps Google HTTP errors → AdapterError but does
   * NOT inspect candidate content (no SAFETY/promptFeedback checks). Used
   * by text completion and embeddings; image flow wraps this in callApi
   * for the additional content-safety filtering.
   */
  private async callRawApi(
    url: string,
    body: unknown,
    agent: HttpsProxyAgent<string> | undefined,
  ): Promise<Record<string, unknown>> {
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
        errObj?.message ?? `google returned status ${status}: ${text.slice(0, 500)}`;
      const code = errObj?.status ?? '';
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

  private async callApi(
    url: string,
    body: unknown,
    agent: HttpsProxyAgent<string> | undefined,
  ): Promise<GeminiResponse> {
    const parsed = (await this.callRawApi(url, body, agent)) as GeminiResponse;

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
