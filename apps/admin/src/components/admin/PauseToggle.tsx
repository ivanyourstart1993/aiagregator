'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Toggle } from '@/components/ui/toggle';
import {
  pauseGenerationAction,
  pauseProviderAction,
} from '@/app/[locale]/(panel)/settings/actions';

interface Props {
  /** 'queue' for global generation/callback queues, 'provider' for per-code */
  kind: 'queue' | 'provider';
  /** Queue name ('generation') or provider code ('google_banana') */
  target: string;
  initialPaused: boolean;
  label: string;
  description?: string;
}

export function PauseToggle({
  kind,
  target,
  initialPaused,
  label,
  description,
}: Props) {
  const [pending, startTransition] = useTransition();

  function onChange(next: boolean) {
    startTransition(async () => {
      const res =
        kind === 'queue'
          ? await pauseGenerationAction(next)
          : await pauseProviderAction(target, next);
      if (res.ok) {
        toast.success(next ? `Пауза: ${label}` : `Возобновлено: ${label}`);
      } else {
        toast.error(`Не удалось переключить: ${res.code ?? 'ошибка'}`);
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description ? (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`text-xs ${initialPaused ? 'text-yellow-500' : 'text-emerald-500'}`}
        >
          {initialPaused ? 'на паузе' : 'работает'}
        </span>
        <Toggle
          checked={!initialPaused}
          onCheckedChange={(checked) => onChange(!checked)}
          disabled={pending}
          aria-label={`Pause ${target}`}
        />
      </div>
    </div>
  );
}
