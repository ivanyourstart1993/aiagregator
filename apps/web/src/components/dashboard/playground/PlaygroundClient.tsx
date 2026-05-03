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

export function PlaygroundClient({ balance }: Props) {
  const t = useTranslations('playground');
  const [taskType, setTaskType] = useState<TaskType>('text_to_image_flash_1k');
  const [prompt, setPrompt] = useState('');
  const [inputImageUrl, setInputImageUrl] = useState('');
  const [aspect, setAspect] = useState<'1:1' | '16:9' | '9:16' | '4:3' | '3:4'>('1:1');

  const [phase, setPhase] = useState<Phase>('idle');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<ResultFile[]>([]);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local image-edit input state. The user can either upload a file
  // (drag-drop / picker / clipboard paste) or paste a URL directly.
  // Once a file uploads we keep its preview blob in localPreviewUrl
  // and the resolved MinIO URL in inputImageUrl.
  const [uploading, setUploading] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFileSelected(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error(t('imageInvalidType'));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error(t('imageTooLarge'));
      return;
    }
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    const preview = URL.createObjectURL(file);
    setLocalPreviewUrl(preview);
    setUploading(true);
    setInputImageUrl('');
    const fd = new FormData();
    fd.append('file', file);
    const res = await uploadImageAction(fd);
    setUploading(false);
    if (!res.ok || !res.url) {
      toast.error(res.error ?? t('imageUploadFailed'));
      URL.revokeObjectURL(preview);
      setLocalPreviewUrl(null);
      return;
    }
    setInputImageUrl(res.url);
  }

  function clearImage() {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    setInputImageUrl('');
  }

  const preset = PRESETS[taskType];

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  // Clipboard-paste support: when image_edit is the active task type,
  // pasting an image anywhere on the page uploads it as the input.
  useEffect(() => {
    if (!preset.needsImage) return;
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void handleFileSelected(file);
            return;
          }
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset.needsImage]);

  // Free preview blob URLs when component unmounts.
  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
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
    if (preset.needsImage && !inputImageUrl.trim()) {
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
    if (preset.needsImage) params.input_images = [inputImageUrl.trim()];

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
            <Label>{t('imageInputLabel')}</Label>

            {localPreviewUrl || inputImageUrl ? (
              <div className="flex items-start gap-3 rounded-md border border-border/60 bg-background/40 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={localPreviewUrl ?? inputImageUrl}
                  alt=""
                  className="h-24 w-24 rounded-md object-cover"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="truncate text-xs text-muted-foreground">
                    {uploading ? t('imageUploading') : inputImageUrl || t('imagePreviewOnly')}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={clearImage}
                    className="h-7 self-start gap-1 px-2 text-xs"
                  >
                    <X className="h-3 w-3" />
                    {t('imageRemove')}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleFileSelected(f);
                }}
                className={`flex w-full flex-col items-center gap-2 rounded-md border-2 border-dashed p-6 text-sm transition-colors ${
                  dragOver
                    ? 'border-info bg-info/5 text-info'
                    : 'border-border/60 text-muted-foreground hover:border-info/40 hover:text-foreground'
                }`}
              >
                <Upload className="h-5 w-5" />
                <span className="font-medium">{t('imageDropZone')}</span>
                <span className="text-xs">{t('imageDropHint')}</span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFileSelected(f);
                e.target.value = '';
              }}
            />

            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">
                {t('imageOrUrl')}
              </summary>
              <Input
                id="image-url"
                type="url"
                placeholder="https://..."
                value={localPreviewUrl ? '' : inputImageUrl}
                disabled={!!localPreviewUrl || uploading}
                onChange={(e) => setInputImageUrl(e.target.value)}
                className="mt-2"
              />
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
