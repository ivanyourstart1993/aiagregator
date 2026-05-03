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
import { formatNanoUSDWithSign } from '@/lib/money';

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
  | 'text_to_video_fast_1080p'
  | 'text_to_video_quality_1080p';

interface PresetSpec {
  provider: string;
  model: string;
  method: string;
  resolution?: string;
  durationSeconds?: number;
  needsImage?: boolean;
  needsVideo?: true;
  // Display price (matches default tariff). We only show an estimate here —
  // the real cost is decided server-side at admit, this is just for UX.
  approxUsd: number;
}

const PRESETS: Record<TaskType, PresetSpec> = {
  text_to_image_flash_1k: {
    provider: 'google_banana',
    model: 'gemini-3.1-flash-image-preview',
    method: 'text_to_image',
    resolution: '1K',
    approxUsd: 0.019,
  },
  text_to_image_flash_2k: {
    provider: 'google_banana',
    model: 'gemini-3.1-flash-image-preview',
    method: 'text_to_image',
    resolution: '2K',
    approxUsd: 0.0238,
  },
  text_to_image_pro_2k: {
    provider: 'google_banana',
    model: 'gemini-3-pro-image-preview',
    method: 'text_to_image',
    resolution: '2K',
    approxUsd: 0.047,
  },
  image_edit_flash_1k: {
    provider: 'google_banana',
    model: 'gemini-3.1-flash-image-preview',
    method: 'image_edit',
    resolution: '1K',
    needsImage: true,
    approxUsd: 0.019,
  },
  image_edit_pro_2k: {
    provider: 'google_banana',
    model: 'gemini-3-pro-image-preview',
    method: 'image_edit',
    resolution: '2K',
    needsImage: true,
    approxUsd: 0.047,
  },
  text_to_video_fast_1080p: {
    provider: 'google_veo',
    model: 'veo-3.0-fast-generate-001',
    method: 'text_to_video',
    resolution: '1080p',
    durationSeconds: 8,
    needsVideo: true,
    approxUsd: 1.08,
  },
  text_to_video_quality_1080p: {
    provider: 'google_veo',
    model: 'veo-3.0-generate-001',
    method: 'text_to_video',
    resolution: '1080p',
    durationSeconds: 8,
    needsVideo: true,
    approxUsd: 2.7,
  },
};

const TASK_GROUPS: Array<{ labelKey: string; types: TaskType[] }> = [
  {
    labelKey: 'groupImageGen',
    types: ['text_to_image_flash_1k', 'text_to_image_flash_2k', 'text_to_image_pro_2k'],
  },
  {
    labelKey: 'groupImageEdit',
    types: ['image_edit_flash_1k', 'image_edit_pro_2k'],
  },
  {
    labelKey: 'groupVideo',
    types: ['text_to_video_fast_1080p', 'text_to_video_quality_1080p'],
  },
];

type Phase = 'idle' | 'submitting' | 'queued' | 'processing' | 'succeeded' | 'failed';

interface ResultFile {
  url: string;
  type: string;
  mime_type?: string;
}

interface InputImage {
  id: string;
  previewUrl: string; // either blob: URL (uploaded file) or remote URL
  remoteUrl: string | null; // null while uploading, set when MinIO returns
  uploading: boolean;
  error?: string;
}

const MAX_INPUT_IMAGES = 6;

export function PlaygroundClient({ balance }: Props) {
  const t = useTranslations('playground');
  const [taskType, setTaskType] = useState<TaskType>('text_to_image_flash_1k');
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<'1:1' | '16:9' | '9:16' | '4:3' | '3:4'>('1:1');

  const [phase, setPhase] = useState<Phase>('idle');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<ResultFile[]>([]);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const remainingSlots = MAX_INPUT_IMAGES - images.length;
    if (remainingSlots <= 0) {
      toast.error(t('imageMaxReached', { max: MAX_INPUT_IMAGES }));
      return;
    }
    const toUpload = arr.slice(0, remainingSlots);
    if (arr.length > toUpload.length) {
      toast.error(t('imageMaxReached', { max: MAX_INPUT_IMAGES }));
    }
    await Promise.all(toUpload.map((f) => uploadOne(f)));
  }

  function addUrl() {
    const u = urlDraft.trim();
    if (!u) return;
    if (images.length >= MAX_INPUT_IMAGES) {
      toast.error(t('imageMaxReached', { max: MAX_INPUT_IMAGES }));
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

  // Clipboard-paste support: when image_edit is the active task type,
  // pasting an image anywhere on the page uploads it as an additional
  // input. Multiple images in one paste event are all picked up.
  useEffect(() => {
    if (!preset.needsImage) return;
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
  }, [preset.needsImage, images.length]);

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
    if (preset.needsImage && uploading) {
      toast.error(t('imageStillUploading'));
      return;
    }
    if (preset.needsImage && readyImageUrls.length === 0) {
      toast.error(t('imageRequired'));
      return;
    }

    setPhase('submitting');
    setError(null);
    setFiles([]);
    setTaskId(null);

    const params: Record<string, unknown> = {
      prompt: prompt.trim(),
      aspect_ratio: aspect,
    };
    if (preset.resolution) params.resolution = preset.resolution;
    if (preset.durationSeconds) params.duration_seconds = preset.durationSeconds;
    if (preset.needsImage) params.input_images = readyImageUrls;

    const res = await submitGenerationAction({
      provider: preset.provider,
      model: preset.model,
      method: preset.method,
      params,
    });
    if (!res.ok || !res.taskId) {
      setPhase('failed');
      setError(res.error ?? t('errorGeneric'));
      return;
    }
    setTaskId(res.taskId);
    setPhase('queued');
    pollTask(res.taskId);
  }

  async function pollTask(id: string) {
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
            if (f && typeof f === 'object' && typeof (f as { url?: string }).url === 'string') {
              arr.push({
                url: (f as { url: string }).url,
                type: (f as { type?: string }).type ?? 'image',
                mime_type: (f as { mime_type?: string }).mime_type,
              });
            }
          }
        } else if (result && typeof result === 'object') {
          const r = result as { url?: string; type?: string; mime_type?: string; files?: unknown };
          if (Array.isArray(r.files)) {
            for (const f of r.files) {
              if (f && typeof f === 'object' && typeof (f as { url?: string }).url === 'string') {
                arr.push({
                  url: (f as { url: string }).url,
                  type: (f as { type?: string }).type ?? 'image',
                  mime_type: (f as { mime_type?: string }).mime_type,
                });
              }
            }
          } else if (typeof r.url === 'string') {
            arr.push({ url: r.url, type: r.type ?? 'image', mime_type: r.mime_type });
          }
        }
        setFiles(arr);
        return;
      }
      if (task.status === 'FAILED' || task.status === 'CANCELLED') {
        setPhase('failed');
        setError(task.errorMessage ?? task.errorCode ?? t('errorGeneric'));
        return;
      }
      // still PENDING / PROCESSING
      setPhase(task.status === 'PROCESSING' ? 'processing' : 'queued');
      pollRef.current = setTimeout(() => pollTask(id), 2000);
    }
  }

  const isBusy = phase === 'submitting' || phase === 'queued' || phase === 'processing';

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left: form */}
      <div className="space-y-5 lg:col-span-7">
        <div className="space-y-3 rounded-lg border bg-card/40 p-5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            {t('whatToGenerate')}
          </Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {TASK_GROUPS.map((g) => (
              <div key={g.labelKey} className="space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground">{t(g.labelKey)}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.types.map((tp) => {
                    const active = taskType === tp;
                    const p = PRESETS[tp];
                    return (
                      <button
                        key={tp}
                        type="button"
                        onClick={() => setTaskType(tp)}
                        className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                          active
                            ? 'border-info bg-info/15 text-info'
                            : 'border-border/60 bg-background hover:border-border'
                        }`}
                      >
                        {t(`type_${tp}`)}{' '}
                        <span className="text-muted-foreground">${p.approxUsd.toFixed(4)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
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

        {preset.needsImage ? (
          <div className="space-y-3 rounded-lg border bg-card/40 p-5">
            <div className="flex items-center justify-between">
              <Label>{t('imageInputLabel')}</Label>
              <span className="text-xs text-muted-foreground">
                {t('imageCount', { current: images.length, max: MAX_INPUT_IMAGES })}
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

              {images.length < MAX_INPUT_IMAGES ? (
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
              multiple
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

        <div className="flex items-center justify-between rounded-lg border bg-card/40 p-5">
          <div className="text-sm">
            <div className="text-muted-foreground">{t('costEstimate')}</div>
            <div className="font-mono text-base font-semibold text-foreground">
              ≈ ${preset.approxUsd.toFixed(4)}
            </div>
          </div>
          {balance ? (
            <div className="text-right text-sm">
              <div className="text-muted-foreground">{t('balance')}</div>
              <div className="font-mono text-base font-semibold text-foreground">
                {formatNanoUSDWithSign(balance.available)}
              </div>
            </div>
          ) : null}
          <Button onClick={handleSubmit} disabled={isBusy || uploading} size="lg" className="gap-2">
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
      </div>

      {/* Right: result */}
      <div className="space-y-4 lg:col-span-5">
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
              {taskId ? (
                <code className="text-xs text-muted-foreground/60">{taskId.slice(0, 12)}</code>
              ) : null}
            </div>
          ) : null}

          {phase === 'failed' ? (
            <div className="space-y-2 text-center">
              <p className="text-sm font-semibold text-destructive">{t('failedTitle')}</p>
              <p className="text-xs text-muted-foreground">{error}</p>
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
  );
}

function ResultPreview({ file }: { file: ResultFile }) {
  const t = useTranslations('playground');
  const isVideo = file.type === 'video' || file.mime_type?.startsWith('video/');
  return (
    <div className="space-y-2">
      {isVideo ? (
        <video src={file.url} controls className="w-full rounded-md" />
      ) : (
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
