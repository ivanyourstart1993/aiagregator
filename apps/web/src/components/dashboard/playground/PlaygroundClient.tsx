'use client';

import { Download, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  submitGenerationAction,
  pollTaskAction,
  uploadImageAction,
} from '@/app/[locale]/(dashboard)/playground/actions';
import type { BalanceView } from '@/lib/server-api';
import { formatNanoUSDWithSign, nanoToCents } from '@/lib/money';
import { Link } from '@/i18n/navigation';
import type { TaskType } from './playground-presets';
import { PRESETS, TASK_GROUPS } from './playground-presets';

// Unified price formatter for the playground. Replaces inconsistent
// .toFixed(4) all over the place so the user sees comparable formats:
//   $0.00      → "Бесплатно"
//   < $0.01    → "< $0.01"
//   < $1       → "$0.025" (3 decimals — image tier)
//   >= $1      → "$1.12"  (2 decimals — video tier)
function formatPrice(usd: number): string {
  if (usd === 0) return 'Бесплатно';
  if (usd < 0.01) return '< $0.01';
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

// Maps a preset's mode value (Kling std/pro, OpenAI low/medium/high/std/hd) to
// a chip label + colour class. Returns null when the value isn't displayed —
// e.g. text_to_video / image_to_video markers used for Veo/Seedance bundling.
function modeChipFor(mode: string | undefined): { label: string; bg: string } | null {
  if (!mode) return null;
  switch (mode) {
    case 'pro':
      return { label: 'PRO', bg: 'bg-purple-500/20 text-purple-300' };
    case 'standard':
      return { label: 'STD', bg: 'bg-muted text-muted-foreground' };
    case 'low':
      return { label: 'LOW', bg: 'bg-muted text-muted-foreground' };
    case 'medium':
      return { label: 'MED', bg: 'bg-info/20 text-info' };
    case 'high':
      return { label: 'HIGH', bg: 'bg-purple-500/20 text-purple-300' };
    case 'hd':
      return { label: 'HD', bg: 'bg-purple-500/20 text-purple-300' };
    default:
      return null;
  }
}

interface Props {
  balance: BalanceView | null;
}

// Vertex AI embedding task_type enum (text-embedding-004 supports all 8).
// RETRIEVAL_DOCUMENT is the most common default for indexing-side calls.
const EMBED_TASK_TYPES = [
  'RETRIEVAL_DOCUMENT',
  'RETRIEVAL_QUERY',
  'SEMANTIC_SIMILARITY',
  'CLASSIFICATION',
  'CLUSTERING',
  'QUESTION_ANSWERING',
  'FACT_VERIFICATION',
  'CODE_RETRIEVAL_QUERY',
] as const;
type EmbedTaskType = (typeof EMBED_TASK_TYPES)[number];

interface TextResult {
  text: string;
  finish_reason?: string;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  tool_calls?: unknown[];
}

interface EmbeddingResult {
  model?: string;
  embeddings: number[][];
  dimension?: number;
  count?: number;
}

function parseTextResult(raw: unknown): TextResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.text !== 'string') return null;
  return {
    text: r.text,
    finish_reason: typeof r.finish_reason === 'string' ? r.finish_reason : undefined,
    model: typeof r.model === 'string' ? r.model : undefined,
    usage:
      r.usage && typeof r.usage === 'object'
        ? (r.usage as TextResult['usage'])
        : undefined,
    tool_calls: Array.isArray(r.tool_calls) ? r.tool_calls : undefined,
  };
}

function parseEmbeddingResult(raw: unknown): EmbeddingResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.embeddings)) return null;
  return {
    embeddings: r.embeddings as number[][],
    model: typeof r.model === 'string' ? r.model : undefined,
    dimension: typeof r.dimension === 'number' ? r.dimension : undefined,
    count: typeof r.count === 'number' ? r.count : undefined,
  };
}

type Phase = 'idle' | 'submitting' | 'queued' | 'processing' | 'succeeded' | 'failed';

interface ResultFile {
  url: string;
  type: string;
  mime_type?: string;
}

// Producers (`apps/api/.../poll-lro.cron.ts` and `apps/worker/.../generation.processor.ts`)
// emit `{ url, fileType, mimeType }` (camelCase). Older code paths or hand-rolled
// payloads may use `{ type, mime_type }` (snake_case). Accept both so the video
// player can detect a Kling/Veo result regardless of the producer.
function toResultFile(raw: unknown): ResultFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.url !== 'string') return null;
  const fileType =
    typeof r.fileType === 'string'
      ? r.fileType
      : typeof r.type === 'string'
        ? r.type
        : 'image';
  const mimeType =
    typeof r.mimeType === 'string'
      ? r.mimeType
      : typeof r.mime_type === 'string'
        ? r.mime_type
        : undefined;
  return { url: r.url, type: fileType, mime_type: mimeType };
}

function isVideoFile(f: ResultFile): boolean {
  return f.type === 'video' || f.mime_type?.startsWith('video/') === true;
}

interface InputImage {
  id: string;
  previewUrl: string; // either blob: URL (uploaded file) or remote URL
  remoteUrl: string | null; // null while uploading, set when MinIO returns
  uploading: boolean;
  error?: string;
}

interface RecentTask {
  taskId: string;
  preset: TaskType;
  files: ResultFile[];
  finishedAt: number;
}

const MAX_INPUT_IMAGES = 6;
const MAX_RECENT_TASKS = 6;
// Polling tuning: keep frequent polls on the first ~minute (fast wins),
// then back off so a stuck Kling job doesn't spam 150+ requests over 5
// minutes. Hard timeout at 15 min — surface as a "took too long" error.
const POLL_INITIAL_MS = 2000;
const POLL_MAX_MS = 10_000;
const POLL_TIMEOUT_MS = 15 * 60_000;

export function PlaygroundClient({ balance }: Props) {
  const t = useTranslations('playground');
  const [taskType, setTaskType] = useState<TaskType>('text_to_image_flash_1k');
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<'1:1' | '16:9' | '9:16' | '4:3' | '3:4'>('1:1');
  const [duration, setDuration] = useState<number>(8);
  // Motion Control reference video — a hosted URL (mp4/mov) OR an uploaded
  // file. Upload streams through /api/playground/upload-video (no buffering),
  // so clips up to 200MB are fine — users no longer need to paste a Drive
  // link (which providers like Kling can't download).
  const [referenceVideo, setReferenceVideo] = useState('');
  const [uploadingVideo, setUploadingVideo] = useState(false);

  // Gemini text generation controls.
  const [systemInstruction, setSystemInstruction] = useState('');
  const [responseMime, setResponseMime] = useState<'text/plain' | 'application/json'>(
    'text/plain',
  );
  const [responseSchemaText, setResponseSchemaText] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxOutputTokens, setMaxOutputTokens] = useState<number | ''>(1024);

  // Gemini embedding controls.
  const [embedInputs, setEmbedInputs] = useState('');
  const [embedTaskType, setEmbedTaskType] = useState<EmbedTaskType>('RETRIEVAL_DOCUMENT');
  const [outputDimensionality, setOutputDimensionality] = useState<number | ''>('');

  const [phase, setPhase] = useState<Phase>('idle');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [files, setFiles] = useState<ResultFile[]>([]);
  const [textResult, setTextResult] = useState<TextResult | null>(null);
  const [embeddingResult, setEmbeddingResult] = useState<EmbeddingResult | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef<number>(0);
  const pollCountRef = useRef<number>(0);
  // Recent generations strip — kept client-side only. Persists across
  // submits in the same session so the user can flip back to a previous
  // result they liked.
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);

  // Up to MAX_INPUT_IMAGES source images for image_edit. Each can be a
  // file upload (preview is a blob: URL, remoteUrl filled after upload)
  // or a manually entered URL (preview === remoteUrl).
  const [images, setImages] = useState<InputImage[]>([]);
  const [urlDraft, setUrlDraft] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const uploading = images.some((i) => i.uploading);
  const hasImages = images.length > 0;
  const readyImageUrls = images
    .map((i) => i.remoteUrl)
    .filter((u): u is string => typeof u === 'string' && u.length > 0);

  async function uploadOne(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error(t('imageInvalidType'));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error(t('imageTooLarge'));
      return;
    }
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const preview = URL.createObjectURL(file);
    setImages((prev) => [
      ...prev,
      { id, previewUrl: preview, remoteUrl: null, uploading: true },
    ]);
    const fd = new FormData();
    fd.append('file', file);
    const res = await uploadImageAction(fd);
    if (!res.ok || !res.url) {
      const msg = res.error ?? t('imageUploadFailed');
      toast.error(msg);
      setImages((prev) => {
        const m = prev.find((i) => i.id === id);
        if (m) URL.revokeObjectURL(m.previewUrl);
        return prev.filter((i) => i.id !== id);
      });
      return;
    }
    setImages((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, remoteUrl: res.url ?? null, uploading: false } : i,
      ),
    );
  }

  async function handleFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList);
    const remainingSlots = imageCap - images.length;
    if (remainingSlots <= 0) {
      toast.error(t('imageMaxReached', { max: imageCap }));
      return;
    }
    const toUpload = arr.slice(0, remainingSlots);
    if (arr.length > toUpload.length) {
      toast.error(t('imageMaxReached', { max: imageCap }));
    }
    await Promise.all(toUpload.map((f) => uploadOne(f)));
  }

  function addUrl() {
    const u = urlDraft.trim();
    if (!u) return;
    if (images.length >= imageCap) {
      toast.error(t('imageMaxReached', { max: imageCap }));
      return;
    }
    if (!/^https?:\/\//i.test(u)) {
      toast.error(t('imageBadUrl'));
      return;
    }
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setImages((prev) => [
      ...prev,
      { id, previewUrl: u, remoteUrl: u, uploading: false },
    ]);
    setUrlDraft('');
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const m = prev.find((i) => i.id === id);
      if (m && m.previewUrl.startsWith('blob:')) URL.revokeObjectURL(m.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }

  async function uploadReferenceVideo(file: File) {
    if (!file.type.startsWith('video/')) {
      toast.error(t('refVideoInvalidType'));
      return;
    }
    // 200MB ceiling matches the API stream guard.
    if (file.size > 200 * 1024 * 1024) {
      toast.error(t('refVideoTooLarge'));
      return;
    }
    setUploadingVideo(true);
    try {
      // Stream the raw file straight to the Next route handler (which proxies
      // to the API → MinIO). No FormData: the body IS the bytes.
      const res = await fetch('/api/playground/upload-video', {
        method: 'POST',
        headers: { 'content-type': file.type },
        body: file,
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: { message?: string };
      };
      if (!res.ok || !data.url) {
        toast.error(data.error?.message ?? t('refVideoUploadFailed'));
        return;
      }
      setReferenceVideo(data.url);
      toast.success(t('refVideoUploaded'));
    } catch {
      toast.error(t('refVideoUploadFailed'));
    } finally {
      setUploadingVideo(false);
    }
  }

  const preset = PRESETS[taskType];

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const presetKind = preset.kind ?? 'image';
  const isTextPreset = presetKind === 'text';
  const isEmbeddingPreset = presetKind === 'embedding';
  const isMediaPreset = !isTextPreset && !isEmbeddingPreset;
  const isMotionControl = preset.method === 'motion_control';

  // The upload zone is shown when an image is required (image_edit) or
  // optional (video → image_to_video). Text/embedding presets never accept
  // images.
  const acceptsImage =
    isMediaPreset && (preset.needsImage || (preset.needsVideo && !!preset.imageMethod));
  // Veo's image_to_video takes a single first-frame image; Banana's
  // image_edit accepts up to MAX_INPUT_IMAGES. Cap at runtime.
  const imageCap = preset.needsImage
    ? preset.maxInputImages ?? MAX_INPUT_IMAGES
    : 1;

  // Reset duration when switching presets so we never carry "10s" into
  // a model that doesn't support it. `durationOptions[0]` is the canonical
  // default — for Kling that's 5s (cheaper), for Veo that's 4s.
  useEffect(() => {
    const opts = preset.durationOptions;
    if (opts && opts.length > 0 && !opts.includes(duration)) {
      setDuration(opts[0]!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskType]);

  // Clipboard-paste support: while an image-accepting preset is active,
  // pasting images anywhere on the page uploads them as inputs.
  useEffect(() => {
    if (!acceptsImage) return;
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pasted: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) pasted.push(file);
        }
      }
      if (pasted.length > 0) {
        e.preventDefault();
        void handleFiles(pasted);
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptsImage, images.length]);

  // Free preview blob URLs when component unmounts.
  useEffect(() => {
    return () => {
      for (const i of images) {
        if (i.previewUrl.startsWith('blob:')) URL.revokeObjectURL(i.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    // Branch: embedding presets read from `embedInputs` instead of `prompt`.
    if (isEmbeddingPreset) {
      const lines = embedInputs
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length === 0) {
        toast.error(t('embedInputsRequired'));
        return;
      }
      if (lines.length > 100) {
        toast.error(t('embedInputsTooMany'));
        return;
      }
      if (
        outputDimensionality !== '' &&
        (outputDimensionality < 8 || outputDimensionality > 768)
      ) {
        toast.error(t('embedDimOutOfRange'));
        return;
      }
    } else {
      // Motion Control's prompt is optional (the motion comes from the
      // reference video); every other media/text preset requires a prompt.
      if (!prompt.trim() && !isMotionControl) {
        toast.error(t('promptRequired'));
        return;
      }
      if (uploading) {
        toast.error(t('imageStillUploading'));
        return;
      }
      if (preset.needsImage && readyImageUrls.length === 0) {
        toast.error(t('imageRequired'));
        return;
      }
      if (isMotionControl) {
        const rv = referenceVideo.trim();
        if (!rv) {
          toast.error(t('refVideoRequired'));
          return;
        }
        if (!/^https?:\/\//i.test(rv)) {
          toast.error(t('refVideoBadUrl'));
          return;
        }
      }
    }

    // Validate JSON schema textarea up front for text + JSON-mode so the
    // user gets a clear toast rather than a generic provider error.
    let parsedResponseSchema: unknown = undefined;
    if (isTextPreset && responseMime === 'application/json' && responseSchemaText.trim()) {
      try {
        parsedResponseSchema = JSON.parse(responseSchemaText);
      } catch {
        toast.error(t('responseSchemaInvalid'));
        return;
      }
    }

    setPhase('submitting');
    setError(null);
    setErrorCode(null);
    setFiles([]);
    setTextResult(null);
    setEmbeddingResult(null);
    setTaskId(null);
    pollCountRef.current = 0;
    pollStartRef.current = Date.now();

    const params: Record<string, unknown> = {};

    if (isTextPreset) {
      params.prompt = prompt.trim();
      if (systemInstruction.trim()) params.system_instruction = systemInstruction.trim();
      params.response_mime_type = responseMime;
      if (responseMime === 'application/json' && parsedResponseSchema !== undefined) {
        params.response_schema = parsedResponseSchema;
      }
      params.temperature = temperature;
      if (typeof maxOutputTokens === 'number' && maxOutputTokens > 0) {
        params.max_output_tokens = maxOutputTokens;
      }
    } else if (isEmbeddingPreset) {
      const inputs = embedInputs
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      params.inputs = inputs;
      params.task_type = embedTaskType;
      if (typeof outputDimensionality === 'number' && outputDimensionality > 0) {
        params.output_dimensionality = outputDimensionality;
      }
    } else if (isMotionControl) {
      // Motion Control prompt is optional — only send when non-empty.
      if (prompt.trim()) params.prompt = prompt.trim();
    } else {
      params.prompt = prompt.trim();
    }

    let methodCode = preset.method;

    if (isMotionControl) {
      // Motion Control: character image + reference motion video. The schema
      // uses additionalProperties:false, so do NOT send resolution/aspect_ratio
      // (mode implies resolution; duration follows the reference video).
      params.input_image = readyImageUrls[0];
      params.reference_video = referenceVideo.trim();
      params.character_orientation = 'video';
      params.duration_seconds = duration;
      if (preset.mode) params.mode = preset.mode;
    } else {
      if (isMediaPreset && !preset.needsVideo) params.aspect_ratio = aspect;
      if (isMediaPreset && preset.resolution) params.resolution = preset.resolution;

      // Method routing:
      //   image_edit: bound by preset (needsImage = true)
      //   video: text_to_video by default; switch to image_to_video when
      //     the user attached an image (preset.imageMethod must be set).
      if (preset.needsImage) {
        params.input_images = readyImageUrls;
      } else if (preset.needsVideo) {
        params.duration_seconds = duration;
        if (preset.mode) params.mode = preset.mode;
        if (readyImageUrls.length > 0 && preset.imageMethod) {
          methodCode = preset.imageMethod;
          // Each provider's `image_to_video` schema declares its own field
          // name. Schemas use `additionalProperties: false`, so we must
          // send exactly the right key — wrong one fails catalog validation
          // with "Request parameters failed validation".
          //   Veo:      input_image_url: string
          //   Kling:    input_images: string[]  (1-2 URLs)
          //   Seedance: image: string
          if (preset.provider === 'kling_ai') {
            params.input_images = readyImageUrls.slice(0, 2);
          } else if (preset.provider === 'seedance') {
            // Both Seedance code paths (BytePlus-direct doubao-* and
            // OpenRouter-routed openrouter-seedance-*) use `image` — the
            // OpenRouter adapter wraps it into `frame_images[0].image_url.url`
            // server-side; the public schema just needs a single URL string.
            params.image = readyImageUrls[0];
          } else {
            params.input_image_url = readyImageUrls[0];
          }
        }
      }

      // Veo and Seedance bundles are keyed by `mode = methodCode` (text_to_video
      // vs image_to_video) so the seed price for the chosen task type lines up.
      // For Kling the `mode` slot already carries 'standard' / 'pro' from the
      // preset (set in the needsVideo block above).
      if (preset.provider === 'google_veo' || preset.provider === 'seedance') {
        params.mode = methodCode;
      }
      // For non-video presets (OpenAI Image gpt-image-1 low/medium/high,
      // dall-e-3 standard/hd) — forward the preset's quality tier as
      // params.mode if it isn't already set. The bundle key is hashed with
      // mode as a dimension, so without this the admit lookup falls into a
      // null-mode bundle with no price → "Pricing is not configured".
      if (preset.mode && params.mode === undefined) {
        params.mode = preset.mode;
      }
    }

    const res = await submitGenerationAction({
      provider: preset.provider,
      model: preset.model,
      method: methodCode,
      params,
    });
    if (!res.ok || !res.taskId) {
      setPhase('failed');
      setError(res.error ?? t('errorGeneric'));
      setErrorCode((res as { code?: string }).code ?? null);
      return;
    }
    setTaskId(res.taskId);
    setPhase('queued');
    pollTask(res.taskId);
  }

  async function pollTask(id: string) {
    // Hard timeout — surface a friendly "took too long" rather than
    // polling forever.
    if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
      setPhase('failed');
      setError(t('errorTimeout'));
      setErrorCode('task_timeout');
      return;
    }
    const res = await pollTaskAction(id);
    if (!res.ok) {
      setPhase('failed');
      setError(res.error);
      return;
    }
    const task = res.task;
    {
      if (task.status === 'SUCCEEDED') {
        setPhase('succeeded');
        // For text/embedding presets the payload lives in task.result;
        // result_files is an empty array. Extract structured data so the
        // result panel can render it without falling through to the
        // file-grid renderer.
        if (isTextPreset) {
          setTextResult(parseTextResult(task.result));
        } else if (isEmbeddingPreset) {
          setEmbeddingResult(parseEmbeddingResult(task.result));
        }
        const result = task.result_files ?? task.result;
        const arr: ResultFile[] = [];
        if (Array.isArray(result)) {
          for (const f of result) {
            const parsed = toResultFile(f);
            if (parsed) arr.push(parsed);
          }
        } else if (result && typeof result === 'object') {
          const nested = (result as { files?: unknown }).files;
          if (Array.isArray(nested)) {
            for (const f of nested) {
              const parsed = toResultFile(f);
              if (parsed) arr.push(parsed);
            }
          } else {
            const parsed = toResultFile(result);
            if (parsed) arr.push(parsed);
          }
        }
        setFiles(arr);
        // Push to recent strip (deduped by taskId, capped at MAX).
        if (arr.length > 0) {
          setRecentTasks((prev) => {
            const without = prev.filter((r) => r.taskId !== id);
            return [
              { taskId: id, preset: taskType, files: arr, finishedAt: Date.now() },
              ...without,
            ].slice(0, MAX_RECENT_TASKS);
          });
        }
        return;
      }
      if (task.status === 'FAILED' || task.status === 'CANCELLED') {
        setPhase('failed');
        // Leave raw null when the API has no message — friendlyError() will
        // then prefer code-based i18n or the "contact support with task ID"
        // template instead of falling back to the generic string here.
        setError(task.errorMessage ?? null);
        setErrorCode(task.errorCode ?? null);
        return;
      }
      // Still PENDING / PROCESSING — schedule next poll with backoff.
      // First ~10 attempts every 2s (Veo/image typical case), then ramp
      // up to 10s (Kling video typical case) so we don't spam 150 polls
      // over the 5-min Kling generation window.
      setPhase(task.status === 'PROCESSING' ? 'processing' : 'queued');
      pollCountRef.current += 1;
      const delay = Math.min(
        POLL_INITIAL_MS + pollCountRef.current * 500,
        POLL_MAX_MS,
      );
      pollRef.current = setTimeout(() => pollTask(id), delay);
    }
  }

  // User-friendly error code → human text. Falls back to the raw error
  // message if the code is unknown, and finally to a "contact support with
  // task ID" template when even the raw message is empty (which happens
  // after sanitizeTaskError wipes internal codes for codes like `temporary`
  // that don't map cleanly to a public bucket — see sanitize-task-error.ts).
  // Extract the most useful human-readable string from a provider error
  // message — adapters and routers often double-wrap them (e.g. OpenRouter
  // passes BytePlus errors back as `HTTP 400: {"error":{"message":"..."}}`).
  // Returns null when the raw is empty or contains no extractable detail.
  function extractProviderDetail(raw: string | null): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    // Strip an `HTTP <code>: ` prefix if present
    const m = trimmed.match(/^HTTP\s+\d+:\s*(.*)$/is);
    const body = m ? m[1]!.trim() : trimmed;
    // If body looks like JSON, try to pull `.error.message` (or `.error`)
    if (body.startsWith('{') || body.startsWith('[')) {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        const err = (parsed.error ?? parsed.errors) as unknown;
        if (typeof err === 'string') return err;
        if (err && typeof err === 'object') {
          const msg = (err as { message?: unknown }).message;
          if (typeof msg === 'string' && msg.length > 0) return msg;
          const code = (err as { code?: unknown }).code;
          if (typeof code === 'string' && code.length > 0) return code;
        }
        const topMsg = (parsed as { message?: unknown }).message;
        if (typeof topMsg === 'string' && topMsg.length > 0) return topMsg;
      } catch {
        // fall through — keep raw body
      }
    }
    return body || null;
  }

  // User-friendly error code → human text. Falls back to the raw error
  // message if the code is unknown, and finally to a "contact support with
  // task ID" template when even the raw message is empty. For
  // user-caused codes (content_rejected, invalid_parameter, validation)
  // the raw message often contains actionable detail (e.g. "input image
  // may contain real person") — append it under the localized hint so the
  // user sees BOTH the general explanation and the specific reason.
  function friendlyError(code: string | null, raw: string | null): string {
    let localized: string | null = null;
    if (code) {
      const key = `error_${code}`;
      const translated = t(key);
      // next-intl returns the key itself when missing
      if (
        translated &&
        translated !== `playground.${key}` &&
        translated !== key
      ) {
        localized = translated;
      }
    }
    const detail = extractProviderDetail(raw);
    if (localized) {
      const surfacesRawDetail =
        code === 'content_rejected' ||
        code === 'content_filter' ||
        code === 'invalid_parameter' ||
        code === 'validation' ||
        code === 'provider_rejected';
      if (surfacesRawDetail && detail && detail !== localized) {
        return `${localized}\n\n${t('providerDetailPrefix')} ${detail}`;
      }
      return localized;
    }
    if (detail) return detail;
    if (taskId) return t('errorUnknownWithTaskId', { taskId });
    return t('errorGeneric');
  }

  async function copyTaskId() {
    if (!taskId) return;
    try {
      await navigator.clipboard.writeText(taskId);
      toast.success(t('taskIdCopied'));
    } catch {
      toast.error(t('errorGeneric'));
    }
  }

  function showRecent(r: RecentTask) {
    setTaskType(r.preset);
    setTaskId(r.taskId);
    setFiles(r.files);
    setPhase('succeeded');
    setError(null);
    setErrorCode(null);
  }

  const isBusy = phase === 'submitting' || phase === 'queued' || phase === 'processing';

  return (
    <div className="space-y-6">
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left: form */}
      <div className="space-y-5 lg:col-span-7">
        <div className="space-y-3 rounded-lg border bg-card/40 p-5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            {t('whatToGenerate')}
          </Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {TASK_GROUPS.map((g) => {
              // Show "STD = 720p · PRO = 1080p" legend only on groups that
              // actually mix std/pro presets (currently — Kling video).
              const hasStdProModes = g.types.some(
                (tp) =>
                  PRESETS[tp].mode === 'standard' || PRESETS[tp].mode === 'pro',
              );
              return (
              <div key={g.labelKey} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <div className="text-xs font-semibold text-muted-foreground">{t(g.labelKey)}</div>
                  {hasStdProModes ? (
                    <div className="text-[10px] text-muted-foreground/70">
                      {t('modeLegend')}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.types.map((tp) => {
                    const active = taskType === tp;
                    const p = PRESETS[tp];
                    // Quality/mode chip. Highlights premium tiers (pro/hd/high)
                    // in purple, mid (medium) in info-blue, cheap (std/low) muted.
                    const chip = modeChipFor(p.mode);
                    return (
                      <button
                        key={tp}
                        type="button"
                        onClick={() => setTaskType(tp)}
                        title={t(`tooltip_${tp}`)}
                        aria-label={`${t(`type_${tp}`)} — ${t(`tooltip_${tp}`)}`}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/50 ${
                          active
                            ? 'border-info bg-info/15 text-info'
                            : 'border-border/60 bg-background hover:border-border'
                        }`}
                      >
                        <span>{t(`type_${tp}`)}</span>
                        {chip ? (
                          <span className={`rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${chip.bg}`}>
                            {chip.label}
                          </span>
                        ) : null}
                        <span className="text-muted-foreground">{formatPrice(p.approxUsd)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>
        </div>

        {isTextPreset ? (
          <div className="space-y-2 rounded-lg border bg-card/40 p-5">
            <Label htmlFor="systemInstruction">{t('systemInstructionLabel')}</Label>
            <Textarea
              id="systemInstruction"
              value={systemInstruction}
              onChange={(e) => setSystemInstruction(e.target.value)}
              rows={3}
              placeholder={t('systemInstructionPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('systemInstructionHint')}</p>
          </div>
        ) : null}

        {!isEmbeddingPreset ? (
          <div className="space-y-2 rounded-lg border bg-card/40 p-5">
            <Label htmlFor="prompt">{t('promptLabel')}</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder={t('promptPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('promptHint')}</p>
          </div>
        ) : null}

        {isEmbeddingPreset ? (
          <div className="space-y-3 rounded-lg border bg-card/40 p-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="embedInputs">{t('embedInputsLabel')}</Label>
                <span className="text-xs text-muted-foreground">
                  {(() => {
                    const lines = embedInputs
                      .split('\n')
                      .map((l) => l.trim())
                      .filter((l) => l.length > 0).length;
                    return t('embedInputsCount', { current: lines, max: 100 });
                  })()}
                </span>
              </div>
              <Textarea
                id="embedInputs"
                value={embedInputs}
                onChange={(e) => setEmbedInputs(e.target.value)}
                rows={6}
                placeholder={t('embedInputsPlaceholder')}
              />
              <p className="text-xs text-muted-foreground">{t('embedInputsHint')}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="embedTaskType">{t('embedTaskTypeLabel')}</Label>
                <select
                  id="embedTaskType"
                  value={embedTaskType}
                  onChange={(e) => setEmbedTaskType(e.target.value as EmbedTaskType)}
                  className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
                >
                  {EMBED_TASK_TYPES.map((tt) => (
                    <option key={tt} value={tt}>
                      {tt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="outputDim">{t('embedOutputDimLabel')}</Label>
                <Input
                  id="outputDim"
                  type="number"
                  min={8}
                  max={768}
                  value={outputDimensionality}
                  onChange={(e) => {
                    const v = e.target.value;
                    setOutputDimensionality(v === '' ? '' : Number(v));
                  }}
                  placeholder={t('embedOutputDimPlaceholder')}
                />
                <p className="text-[10px] text-muted-foreground">
                  {t('embedOutputDimHint')}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {isTextPreset ? (
          <div className="space-y-3 rounded-lg border bg-card/40 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="responseMime">{t('responseMimeLabel')}</Label>
                <select
                  id="responseMime"
                  value={responseMime}
                  onChange={(e) =>
                    setResponseMime(
                      e.target.value as 'text/plain' | 'application/json',
                    )
                  }
                  className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
                >
                  <option value="text/plain">text/plain</option>
                  <option value="application/json">application/json</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxOutputTokens">{t('maxOutputTokensLabel')}</Label>
                <Input
                  id="maxOutputTokens"
                  type="number"
                  min={1}
                  max={8192}
                  value={maxOutputTokens}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMaxOutputTokens(v === '' ? '' : Number(v));
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="temperature">{t('temperatureLabel')}</Label>
                <span className="font-mono text-xs text-muted-foreground">
                  {temperature.toFixed(2)}
                </span>
              </div>
              <input
                id="temperature"
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-full"
              />
            </div>
            {responseMime === 'application/json' ? (
              <div className="space-y-1.5">
                <Label htmlFor="responseSchema">{t('responseSchemaLabel')}</Label>
                <Textarea
                  id="responseSchema"
                  value={responseSchemaText}
                  onChange={(e) => setResponseSchemaText(e.target.value)}
                  rows={6}
                  placeholder={t('responseSchemaPlaceholder')}
                  className="font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  {t('responseSchemaHint')}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {acceptsImage ? (
          <div className="space-y-3 rounded-lg border bg-card/40 p-5">
            <div className="flex items-center justify-between">
              <Label>
                {preset.needsImage
                  ? t('imageInputLabel')
                  : t('imageInputLabelOptional')}
              </Label>
              <span className="text-xs text-muted-foreground">
                {t('imageCount', { current: images.length, max: imageCap })}
              </span>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
              }}
              className={`grid grid-cols-3 gap-2 rounded-md border-2 border-dashed p-3 transition-colors sm:grid-cols-4 ${
                dragOver
                  ? 'border-info bg-info/5'
                  : hasImages
                    ? 'border-border/60'
                    : 'border-border/60'
              }`}
            >
              {images.map((img) => (
                <div
                  key={img.id}
                  className="group relative aspect-square overflow-hidden rounded-md border border-border/60 bg-background/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.previewUrl} alt="" className="h-full w-full object-cover" />
                  {img.uploading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <Loader2 className="h-5 w-5 animate-spin text-info" />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeImage(img.id)}
                    className="absolute right-1 top-1 rounded-md bg-background/80 p-1 text-foreground opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                    aria-label={t('imageRemove')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {images.length < imageCap ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border/60 bg-background/40 text-xs text-muted-foreground transition-colors hover:border-info/50 hover:text-info"
                >
                  <Upload className="h-4 w-4" />
                  <span>{t('imageAdd')}</span>
                </button>
              ) : null}
            </div>

            <p className="text-xs text-muted-foreground">
              {hasImages ? t('imageDropHintMulti') : t('imageDropZoneMulti')}
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple={imageCap > 1}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void handleFiles(e.target.files);
                e.target.value = '';
              }}
            />

            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">
                {t('imageOrUrl')}
              </summary>
              <div className="mt-2 flex gap-2">
                <Input
                  type="url"
                  placeholder="https://..."
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addUrl();
                    }
                  }}
                />
                <Button type="button" size="sm" variant="outline" onClick={addUrl}>
                  {t('imageAdd')}
                </Button>
              </div>
            </details>
          </div>
        ) : null}

        {preset.needsReferenceVideo ? (
          <div className="space-y-2 rounded-lg border bg-card/40 p-5">
            <Label htmlFor="referenceVideo">{t('refVideoLabel')}</Label>
            <div className="flex gap-2">
              <Input
                id="referenceVideo"
                type="url"
                placeholder="https://...mp4"
                value={referenceVideo}
                onChange={(e) => setReferenceVideo(e.target.value)}
                disabled={uploadingVideo}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploadingVideo}
                onClick={() => videoInputRef.current?.click()}
              >
                {uploadingVideo ? t('refVideoUploading') : t('refVideoUploadBtn')}
              </Button>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadReferenceVideo(f);
                  e.target.value = '';
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('refVideoHint')}</p>
          </div>
        ) : null}

        {isMediaPreset && !preset.needsVideo ? (
          <div className="space-y-2 rounded-lg border bg-card/40 p-5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              {t('aspectRatio')}
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {(['1:1', '16:9', '9:16', '4:3', '3:4'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAspect(a)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    aspect === a
                      ? 'border-info bg-info/15 text-info'
                      : 'border-border/60 bg-background hover:border-border'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {preset.needsVideo && preset.durationOptions ? (
          <div className="space-y-2 rounded-lg border bg-card/40 p-5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              {t('duration')}
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {preset.durationOptions.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    duration === d
                      ? 'border-info bg-info/15 text-info'
                      : 'border-border/60 bg-background hover:border-border'
                  }`}
                >
                  {t('durationSec', { seconds: d })}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {(() => {
          const cost = preset.needsVideo
            ? preset.approxUsd * (duration / (preset.durationBase ?? 8))
            : preset.approxUsd;
          // Balance.available is a nano-USD string; convert to dollars.
          const availableUsd =
            balance != null ? nanoToCents(balance.available) / 100 : null;
          // Add a small tolerance so a $0.560001 cost vs $0.56 balance
          // doesn't flag insufficient. Real reservation rounds half-up.
          const insufficient =
            availableUsd != null && availableUsd + 0.001 < cost;
          const submitDisabled = isBusy || uploading || insufficient;

          return (
            <div className="rounded-lg border bg-card/40 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <div className="text-muted-foreground">{t('costEstimate')}</div>
                  <div
                    className={`font-mono text-base font-semibold ${insufficient ? 'text-destructive' : 'text-foreground'}`}
                  >
                    ≈ {formatPrice(cost)}
                  </div>
                </div>
                {balance ? (
                  <div className="text-sm sm:text-right">
                    <div className="text-muted-foreground">{t('balance')}</div>
                    <div
                      className={`font-mono text-base font-semibold ${insufficient ? 'text-destructive' : 'text-foreground'}`}
                    >
                      {formatNanoUSDWithSign(balance.available)}
                    </div>
                  </div>
                ) : null}
                <Button
                  onClick={handleSubmit}
                  disabled={submitDisabled}
                  size="lg"
                  className="w-full gap-2 sm:w-auto"
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {phase === 'submitting' ? t('submitting') : t('processing')}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      {t('generate')}
                    </>
                  )}
                </Button>
              </div>
              {insufficient ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <span>
                    {t('insufficientBalance', {
                      need: formatPrice(cost),
                      have: formatPrice(availableUsd ?? 0),
                    })}
                  </span>
                  <Link
                    href="/top-up/new"
                    className="ml-auto rounded-md bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t('topUpCta')}
                  </Link>
                </div>
              ) : null}
            </div>
          );
        })()}
      </div>

      {/* Right: result. Sticky on desktop so the user can edit a long
          prompt without losing sight of the result panel. */}
      <div className="space-y-4 lg:col-span-5 lg:sticky lg:top-6 lg:self-start">
        <div className="flex min-h-[400px] items-center justify-center rounded-lg border bg-card/40 p-5">
          {phase === 'idle' ? (
            <p className="text-sm text-muted-foreground">{t('resultEmpty')}</p>
          ) : null}

          {isBusy ? (
            <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-info" />
              <span>
                {phase === 'submitting'
                  ? t('phaseSubmitting')
                  : phase === 'queued'
                    ? t('phaseQueued')
                    : t('phaseProcessing')}
              </span>
              {/* Per-provider ETA hint — Kling video is the slowest (2–5 min),
                  Veo ~1 min, images near-instant. Sets expectations so users
                  don't refresh the page or cancel mid-task. */}
              <span className="text-xs text-muted-foreground/70">
                {preset.provider === 'kling_ai'
                  ? t('etaVideoKling')
                  : preset.provider === 'google_veo'
                    ? t('etaVideoVeo')
                    : preset.provider === 'seedance'
                      ? t('etaVideoSeedance')
                      : t('etaImage')}
              </span>
              {taskId ? (
                <button
                  type="button"
                  onClick={copyTaskId}
                  title={t('taskIdCopyHint')}
                  className="text-xs text-muted-foreground/60 hover:text-foreground"
                >
                  <code>{taskId.slice(0, 12)}</code>
                </button>
              ) : null}
            </div>
          ) : null}

          {phase === 'failed' ? (
            <div className="w-full space-y-3 text-center">
              <p className="text-sm font-semibold text-destructive">{t('failedTitle')}</p>
              <p className="whitespace-pre-line text-xs text-muted-foreground">
                {friendlyError(errorCode, error)}
              </p>
              {errorCode ? (
                <p className="font-mono text-[10px] text-muted-foreground/60">
                  code: {errorCode}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={isBusy || uploading}
                  className="gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('retry')}
                </Button>
                {errorCode === 'insufficient_balance' ||
                errorCode === 'wallet_insufficient' ? (
                  <Link
                    href="/top-up/new"
                    className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t('topUpCta')}
                  </Link>
                ) : null}
                {taskId ? (
                  <button
                    type="button"
                    onClick={copyTaskId}
                    className="rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs text-muted-foreground hover:border-border hover:text-foreground"
                  >
                    {t('copyTaskId')}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {phase === 'succeeded' && files.length > 0 ? (
            <div className="grid w-full gap-3">
              {files.map((f, i) => (
                <ResultPreview key={i} file={f} />
              ))}
            </div>
          ) : null}

          {phase === 'succeeded' && isTextPreset && textResult ? (
            <TextResultView result={textResult} />
          ) : null}

          {phase === 'succeeded' && isEmbeddingPreset && embeddingResult ? (
            <EmbeddingResultView result={embeddingResult} />
          ) : null}
        </div>
      </div>
    </div>

      {/* Recent generations strip — full-width row below the form so
          thumbnails get real horizontal space instead of being crammed
          into the narrow right column. Shown when we have at least one
          cached result and the current phase is idle / succeeded /
          failed (i.e. user is between submits). */}
      {recentTasks.length > 0 && !isBusy ? (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('recentTitle')}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
            {recentTasks.map((r) => {
              const first = r.files[0];
              const isVideo = first ? isVideoFile(first) : false;
              return (
                <button
                  key={r.taskId}
                  type="button"
                  onClick={() => showRecent(r)}
                  title={t(`type_${r.preset}`)}
                  className={`group relative aspect-square overflow-hidden rounded-md border transition-colors ${
                    taskId === r.taskId
                      ? 'border-info'
                      : 'border-border/60 hover:border-border'
                  }`}
                >
                  {first ? (
                    isVideo ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video
                        src={first.url}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                        crossOrigin="anonymous"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={first.url}
                        alt={t(`type_${r.preset}`)}
                        className="h-full w-full object-cover"
                        crossOrigin="anonymous"
                      />
                    )
                  ) : null}
                  <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 py-0.5 text-[9px] font-mono text-muted-foreground">
                    {r.taskId.slice(-6)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TextResultView({ result }: { result: TextResult }) {
  const t = useTranslations('playground');
  // Auto-detect JSON: if the trimmed text starts with { or [ and parses,
  // pretty-print it. Otherwise show raw text. Keeps the playground useful
  // for both chat completions and structured-output workloads.
  let pretty = result.text;
  let isJson = false;
  const trimmed = result.text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      pretty = JSON.stringify(JSON.parse(trimmed), null, 2);
      isJson = true;
    } catch {
      // not JSON — fall through
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(pretty);
      toast.success(t('textCopied'));
    } catch {
      toast.error(t('errorGeneric'));
    }
  }

  const u = result.usage ?? {};
  return (
    <div className="w-full space-y-3">
      <pre className="max-h-[480px] overflow-auto rounded-md border bg-background/60 p-3 text-xs leading-relaxed">
        <code className={isJson ? 'font-mono' : 'whitespace-pre-wrap'}>{pretty}</code>
      </pre>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {result.model ? (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{result.model}</span>
        ) : null}
        {u.input_tokens !== undefined ? (
          <span className="rounded bg-muted px-1.5 py-0.5">
            {t('usageInputTokens', { n: u.input_tokens })}
          </span>
        ) : null}
        {u.output_tokens !== undefined ? (
          <span className="rounded bg-muted px-1.5 py-0.5">
            {t('usageOutputTokens', { n: u.output_tokens })}
          </span>
        ) : null}
        {u.total_tokens !== undefined ? (
          <span className="rounded bg-muted px-1.5 py-0.5">
            {t('usageTotalTokens', { n: u.total_tokens })}
          </span>
        ) : null}
        {result.finish_reason ? (
          <span className="rounded bg-muted px-1.5 py-0.5">
            {t('finishReason')}: {result.finish_reason}
          </span>
        ) : null}
        <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={copy}>
          {t('textCopy')}
        </Button>
      </div>
      {result.tool_calls && result.tool_calls.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {t('toolCalls', { n: result.tool_calls.length })}
          </summary>
          <pre className="mt-2 max-h-[240px] overflow-auto rounded-md border bg-background/60 p-3 text-[11px]">
            <code className="font-mono">
              {JSON.stringify(result.tool_calls, null, 2)}
            </code>
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function EmbeddingResultView({ result }: { result: EmbeddingResult }) {
  const t = useTranslations('playground');
  const dim =
    result.dimension ?? (result.embeddings[0] ? result.embeddings[0].length : 0);
  const count = result.count ?? result.embeddings.length;

  async function copyVector(vec: number[]) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(vec));
      toast.success(t('vectorCopied'));
    } catch {
      toast.error(t('errorGeneric'));
    }
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {result.model ? (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{result.model}</span>
        ) : null}
        <span className="rounded bg-muted px-1.5 py-0.5">
          {t('embedCount', { n: count })}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5">
          {t('embedDim', { n: dim })}
        </span>
      </div>
      <div className="max-h-[480px] overflow-auto rounded-md border bg-background/60">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-background/90">
            <tr className="border-b border-border/60 text-left text-muted-foreground">
              <th className="px-2 py-1.5 font-semibold">#</th>
              <th className="px-2 py-1.5 font-semibold">{t('embedVectorPreview')}</th>
              <th className="px-2 py-1.5 font-semibold text-right">{t('embedActions')}</th>
            </tr>
          </thead>
          <tbody>
            {result.embeddings.map((vec, i) => {
              const preview = vec.slice(0, 6).map((n) => n.toFixed(4)).join(', ');
              const rest = vec.length - 6;
              return (
                <tr key={i} className="border-b border-border/40 last:border-b-0">
                  <td className="px-2 py-1.5 font-mono text-muted-foreground">{i}</td>
                  <td className="px-2 py-1.5 font-mono">
                    [{preview}
                    {rest > 0 ? `, … (${t('embedDimSuffix', { n: vec.length })})` : ''}]
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => copyVector(vec)}
                      className="rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] hover:border-border"
                    >
                      {t('embedCopyVector')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultPreview({ file }: { file: ResultFile }) {
  const t = useTranslations('playground');
  const isVideo = isVideoFile(file);
  return (
    <div className="space-y-2">
      {isVideo ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={file.url}
          controls
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
          className="w-full rounded-md bg-black"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={file.url}
          alt=""
          className="w-full rounded-md"
          crossOrigin="anonymous"
        />
      )}
      <Button asChild size="sm" variant="outline" className="gap-2">
        <a href={file.url} download target="_blank" rel="noopener noreferrer">
          <Download className="h-3 w-3" />
          {t('download')}
        </a>
      </Button>
    </div>
  );
}
