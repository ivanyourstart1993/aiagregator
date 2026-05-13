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

// Curated subset of catalog SKUs for the playground UI. The full catalog
// (with imagen-* and lite tiers) is still reachable via /api-explorer;
// here we only surface the combinations a non-technical user is likely
// to want, plus we hide method-vs-model complexity behind a single
// "task type" picker.
type TaskType =
  | 'text_to_image_flash_1k'
  | 'text_to_image_flash_2k'
  | 'text_to_image_pro_2k'
  | 'image_edit_flash_1k'
  | 'image_edit_pro_2k'
  | 'text_to_image_gptimage_low_1k'
  | 'text_to_image_gptimage_med_1k'
  | 'text_to_image_gptimage_high_1k'
  | 'text_to_image_dalle3_std'
  | 'text_to_image_dalle3_hd'
  | 'image_edit_gptimage_med_1k'
  | 'text_to_video_fast_1080p'
  | 'text_to_video_quality_1080p'
  | 'text_to_video_kling_std'
  | 'text_to_video_kling_pro'
  | 'text_to_video_kling16_std'
  | 'text_to_video_kling16_pro'
  | 'text_to_video_kling21m_pro'
  | 'text_to_video_kling25_pro'
  | 'text_to_video_klingv3_std'
  | 'text_to_video_klingv3_pro'
  | 'text_to_video_seedance_lite_720p'
  | 'text_to_video_seedance_pro_720p'
  | 'text_to_video_seedance_pro_1080p';

interface PresetSpec {
  provider: string;
  model: string;
  // Default method when no input image is attached. For video presets,
  // an attached image switches the call to imageMethod automatically.
  method: string;
  imageMethod?: string; // image_to_video, etc.
  resolution?: string;
  durationOptions?: number[]; // shows duration buttons; first is default
  // Base duration the `approxUsd` price refers to. Cost shown to the user
  // is `approxUsd * (duration / durationBase)`. Veo: 8s, Kling: 5s.
  durationBase?: number;
  // Provider-specific quality/mode tier. Forwarded verbatim into params.mode
  // so the bundle key hash matches the seeded prices. Examples:
  //   Kling: 'standard' | 'pro'
  //   OpenAI gpt-image-1: 'low' | 'medium' | 'high'
  //   OpenAI dall-e-3: 'standard' | 'hd'
  mode?: string;
  needsImage?: boolean;
  needsVideo?: true;
  // Display price — UX-only estimate, the real cost is decided
  // server-side at admit time.
  approxUsd: number;
}

// approxUsd values reflect current Default Tariff pricing in the DB.
// Source: TariffBundlePrice rows for each (provider, model, method, mode,
// resolution) combination. Kept in sync manually for now; future: switch
// to a server-fetched price preview per preset.
const PRESETS: Record<TaskType, PresetSpec> = {
  text_to_image_flash_1k: {
    provider: 'google_banana',
    model: 'gemini-3.1-flash-image-preview',
    method: 'text_to_image',
    resolution: '1K',
    approxUsd: 0.02,
  },
  text_to_image_flash_2k: {
    provider: 'google_banana',
    model: 'gemini-3.1-flash-image-preview',
    method: 'text_to_image',
    resolution: '2K',
    approxUsd: 0.025,
  },
  text_to_image_pro_2k: {
    provider: 'google_banana',
    model: 'gemini-3-pro-image-preview',
    method: 'text_to_image',
    resolution: '2K',
    approxUsd: 0.0495,
  },
  image_edit_flash_1k: {
    provider: 'google_banana',
    model: 'gemini-3.1-flash-image-preview',
    method: 'image_edit',
    resolution: '1K',
    needsImage: true,
    approxUsd: 0.024,
  },
  image_edit_pro_2k: {
    provider: 'google_banana',
    model: 'gemini-3-pro-image-preview',
    method: 'image_edit',
    resolution: '2K',
    needsImage: true,
    approxUsd: 0.0594,
  },
  // OpenAI Images. `mode` carries quality (gpt-image-1: low/medium/high;
  // dall-e-3: standard/hd) — sent as params.mode so the bundle key matches
  // the seeded TariffBundlePrice rows.
  text_to_image_gptimage_low_1k: {
    provider: 'openai_image',
    model: 'gpt-image-1',
    method: 'text_to_image',
    resolution: '1024x1024',
    mode: 'low',
    approxUsd: 0.013,
  },
  text_to_image_gptimage_med_1k: {
    provider: 'openai_image',
    model: 'gpt-image-1',
    method: 'text_to_image',
    resolution: '1024x1024',
    mode: 'medium',
    approxUsd: 0.0483,
  },
  text_to_image_gptimage_high_1k: {
    provider: 'openai_image',
    model: 'gpt-image-1',
    method: 'text_to_image',
    resolution: '1024x1024',
    mode: 'high',
    approxUsd: 0.1921,
  },
  text_to_image_dalle3_std: {
    provider: 'openai_image',
    model: 'dall-e-3',
    method: 'text_to_image',
    resolution: '1024x1024',
    mode: 'standard',
    approxUsd: 0.046,
  },
  text_to_image_dalle3_hd: {
    provider: 'openai_image',
    model: 'dall-e-3',
    method: 'text_to_image',
    resolution: '1024x1024',
    mode: 'hd',
    approxUsd: 0.092,
  },
  image_edit_gptimage_med_1k: {
    provider: 'openai_image',
    model: 'gpt-image-1',
    method: 'image_edit',
    resolution: '1024x1024',
    mode: 'medium',
    needsImage: true,
    approxUsd: 0.0483,
  },
  text_to_video_fast_1080p: {
    provider: 'google_veo',
    model: 'veo-3.0-fast-generate-001',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [4, 6, 8],
    durationBase: 8,
    needsVideo: true,
    approxUsd: 0.35, // $0.04375/s × 8s
  },
  text_to_video_quality_1080p: {
    provider: 'google_veo',
    model: 'veo-3.0-generate-001',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [4, 6, 8],
    durationBase: 8,
    needsVideo: true,
    approxUsd: 3.2, // $0.40/s × 8s — sized for ~$120 profit per coupon
  },
  // Kling: resolution is part of the bundle key (per the seed table) and
  // is implied by the mode — standard=720p, pro=1080p. We send it explicitly
  // so the runtime bundleKey matches the seeded TariffBundlePrice.
  text_to_video_kling_std: {
    provider: 'kling_ai',
    model: 'kling-2.6',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '720p',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'standard',
    needsVideo: true,
    approxUsd: 0.56,
  },
  text_to_video_kling_pro: {
    provider: 'kling_ai',
    model: 'kling-2.6',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'pro',
    needsVideo: true,
    approxUsd: 1.12,
  },
  text_to_video_kling16_std: {
    provider: 'kling_ai',
    model: 'kling-v1-6',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '720p',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'standard',
    needsVideo: true,
    approxUsd: 0.14,
  },
  text_to_video_kling16_pro: {
    provider: 'kling_ai',
    model: 'kling-v1-6',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'pro',
    needsVideo: true,
    approxUsd: 0.49,
  },
  text_to_video_kling21m_pro: {
    provider: 'kling_ai',
    model: 'kling-v2-1-master',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'pro',
    needsVideo: true,
    approxUsd: 0.7,
  },
  text_to_video_kling25_pro: {
    provider: 'kling_ai',
    model: 'kling-v2-5-turbo',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'pro',
    needsVideo: true,
    approxUsd: 0.45,
  },
  text_to_video_klingv3_std: {
    provider: 'kling_ai',
    model: 'kling-v3',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '720p',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'standard',
    needsVideo: true,
    approxUsd: 0.42,
  },
  text_to_video_klingv3_pro: {
    provider: 'kling_ai',
    model: 'kling-v3',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [5, 10],
    durationBase: 5,
    mode: 'pro',
    needsVideo: true,
    approxUsd: 0.56,
  },
  // Seedance. params.mode is overridden to the methodCode at submit time
  // (same convention as Veo) so the bundle key distinguishes t2v from i2v.
  text_to_video_seedance_lite_720p: {
    provider: 'seedance',
    model: 'doubao-seedance-1-0-lite-t2v-250428',
    method: 'text_to_video',
    resolution: '720p',
    durationOptions: [5, 10],
    durationBase: 5,
    needsVideo: true,
    approxUsd: 0.125, // $0.025/s × 5s
  },
  text_to_video_seedance_pro_720p: {
    provider: 'seedance',
    model: 'doubao-seedance-1-0-pro-250528',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '720p',
    durationOptions: [5, 10],
    durationBase: 5,
    needsVideo: true,
    approxUsd: 0.26, // $0.052/s × 5s
  },
  text_to_video_seedance_pro_1080p: {
    provider: 'seedance',
    model: 'doubao-seedance-1-0-pro-250528',
    method: 'text_to_video',
    imageMethod: 'image_to_video',
    resolution: '1080p',
    durationOptions: [5, 10],
    durationBase: 5,
    needsVideo: true,
    approxUsd: 0.585, // $0.117/s × 5s
  },
};

const TASK_GROUPS: Array<{ labelKey: string; types: TaskType[] }> = [
  {
    labelKey: 'groupImageGen',
    types: ['text_to_image_flash_1k', 'text_to_image_flash_2k', 'text_to_image_pro_2k'],
  },
  {
    labelKey: 'groupImageOpenAI',
    types: [
      'text_to_image_gptimage_low_1k',
      'text_to_image_gptimage_med_1k',
      'text_to_image_gptimage_high_1k',
      'text_to_image_dalle3_std',
      'text_to_image_dalle3_hd',
    ],
  },
  {
    labelKey: 'groupImageEdit',
    types: ['image_edit_flash_1k', 'image_edit_pro_2k', 'image_edit_gptimage_med_1k'],
  },
  {
    labelKey: 'groupVideoVeo',
    types: ['text_to_video_fast_1080p', 'text_to_video_quality_1080p'],
  },
  {
    labelKey: 'groupVideoKling',
    types: [
      'text_to_video_kling16_std',
      'text_to_video_kling16_pro',
      'text_to_video_kling_std',
      'text_to_video_kling_pro',
      'text_to_video_klingv3_std',
      'text_to_video_klingv3_pro',
      'text_to_video_kling21m_pro',
      'text_to_video_kling25_pro',
    ],
  },
  {
    labelKey: 'groupVideoSeedance',
    types: [
      'text_to_video_seedance_lite_720p',
      'text_to_video_seedance_pro_720p',
      'text_to_video_seedance_pro_1080p',
    ],
  },
];

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

  const [phase, setPhase] = useState<Phase>('idle');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [files, setFiles] = useState<ResultFile[]>([]);
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

  const preset = PRESETS[taskType];

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  // The upload zone is shown when an image is required (image_edit) or
  // optional (video → image_to_video).
  const acceptsImage = preset.needsImage || (preset.needsVideo && !!preset.imageMethod);
  // Veo's image_to_video takes a single first-frame image; Banana's
  // image_edit accepts up to MAX_INPUT_IMAGES. Cap at runtime.
  const imageCap = preset.needsImage ? MAX_INPUT_IMAGES : 1;

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
    if (!prompt.trim()) {
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

    setPhase('submitting');
    setError(null);
    setErrorCode(null);
    setFiles([]);
    setTaskId(null);
    pollCountRef.current = 0;
    pollStartRef.current = Date.now();

    const params: Record<string, unknown> = {
      prompt: prompt.trim(),
    };
    if (!preset.needsVideo) params.aspect_ratio = aspect;
    if (preset.resolution) params.resolution = preset.resolution;

    // Method routing:
    //   image_edit: bound by preset (needsImage = true)
    //   video: text_to_video by default; switch to image_to_video when
    //     the user attached an image (preset.imageMethod must be set).
    let methodCode = preset.method;
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
          params.image = readyImageUrls[0];
        } else {
          params.input_image_url = readyImageUrls[0];
        }
      }
    }

    // Veo and Seedance bundles are keyed by `mode = methodCode` (text_to_video
    // vs image_to_video) so the seed price for the chosen task type lines up.
    // For Kling the `mode` slot already carries 'standard' / 'pro' from the
    // preset above. OpenAI Image keeps the quality tier set above.
    if (preset.provider === 'google_veo' || preset.provider === 'seedance') {
      params.mode = methodCode;
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
        setError(task.errorMessage ?? task.errorCode ?? t('errorGeneric'));
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
  // message if the code is unknown.
  function friendlyError(code: string | null, raw: string | null): string {
    if (!code) return raw ?? t('errorGeneric');
    const key = `error_${code}`;
    const translated = t(key);
    // next-intl returns the key itself when missing
    return translated && translated !== `playground.${key}` && translated !== key
      ? translated
      : raw ?? t('errorGeneric');
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

        {!preset.needsVideo ? (
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
              <p className="text-xs text-muted-foreground">
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
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={first.url}
                        alt={t(`type_${r.preset}`)}
                        className="h-full w-full object-cover"
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
          className="w-full rounded-md bg-black"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt="" className="w-full rounded-md" />
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
