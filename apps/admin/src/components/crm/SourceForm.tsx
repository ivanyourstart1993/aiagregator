'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createSourceAction,
  updateSourceAction,
} from '@/app/[locale]/(panel)/crm/actions';
import {
  type AdminLeadSourceInput,
  type LeadSourceKind,
  type LeadSourceView,
} from '@/lib/server-api';

const KIND_OPTIONS: { value: LeadSourceKind; label: string; example: string }[] = [
  {
    value: 'ITUNES_SEARCH',
    label: 'iTunes Search API',
    example:
      '{\n  "term": "ai image generator",\n  "country": "us",\n  "limit": 50\n}',
  },
  {
    value: 'PLAY_STORE_SEARCH',
    label: 'Google Play scraper',
    example:
      '{\n  "term": "ai image generator",\n  "country": "us",\n  "lang": "en",\n  "num": 50\n}',
  },
  {
    value: 'LYZEM_SEARCH',
    label: 'Lyzem (TG channels)',
    example:
      '{\n  "query": "midjourney",\n  "language": "ru",\n  "minSubscribers": 1000\n}',
  },
  {
    value: 'TGSTAT_SEARCH',
    label: 'TGStat (TG channels)',
    example:
      '{\n  "query": "нейросеть",\n  "country": "RU",\n  "minSubscribers": 5000\n}',
  },
  {
    value: 'TELEGRAM_MENTIONS',
    label: 'TG mentions crawl',
    example:
      '{\n  "seedChannels": ["@aitalk", "@neurogen_news"],\n  "depth": 1\n}',
  },
  {
    value: 'FACEBOOK_AD_LIBRARY',
    label: 'FB Ad Library',
    example:
      '{\n  "search_terms": "ai art",\n  "ad_active_status": "ACTIVE",\n  "country": "US"\n}',
  },
  {
    value: 'MANUAL',
    label: 'Manual (no scraper)',
    example: '{}',
  },
];

interface Props {
  initial?: LeadSourceView;
  onDone?: () => void;
}

export function SourceForm({ initial, onDone }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [kind, setKind] = useState<LeadSourceKind>(initial?.kind ?? 'ITUNES_SEARCH');
  const [name, setName] = useState(initial?.name ?? '');
  const [config, setConfig] = useState(
    initial ? JSON.stringify(initial.config, null, 2) : KIND_OPTIONS[0].example,
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [intervalMinutes, setIntervalMinutes] = useState(
    initial?.intervalMinutes != null ? String(initial.intervalMinutes) : '',
  );
  const [submitting, setSubmitting] = useState(false);

  function handleKindChange(v: string) {
    const k = v as LeadSourceKind;
    setKind(k);
    if (!initial) {
      const opt = KIND_OPTIONS.find((o) => o.value === k);
      if (opt) setConfig(opt.example);
    }
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error('Введите название');
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(config);
    } catch {
      toast.error('Невалидный JSON в config');
      return;
    }
    const interval = intervalMinutes.trim()
      ? Number(intervalMinutes.trim())
      : null;
    if (interval !== null && (!Number.isFinite(interval) || interval < 1)) {
      toast.error('Интервал должен быть положительным числом или пустым');
      return;
    }
    const input: AdminLeadSourceInput = {
      kind,
      name: name.trim(),
      config: parsed,
      enabled,
      intervalMinutes: interval,
    };
    setSubmitting(true);
    startTransition(async () => {
      const r = initial
        ? await updateSourceAction(initial.id, input)
        : await createSourceAction(input);
      setSubmitting(false);
      if (r.ok) {
        toast.success(initial ? 'Источник обновлён' : 'Источник создан');
        if (!initial) {
          setName('');
          setConfig(KIND_OPTIONS.find((o) => o.value === kind)?.example ?? '{}');
        }
        router.refresh();
        onDone?.();
      } else {
        toast.error(`Ошибка: ${r.code ?? 'error'}`);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label className="mb-1.5">Тип</Label>
          <Select value={kind} onValueChange={handleKindChange} disabled={!!initial}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1.5">Название</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="напр. iTunes — AI image"
          />
        </div>
      </div>

      <div>
        <Label className="mb-1.5">Конфиг (JSON)</Label>
        <Textarea
          rows={10}
          className="font-mono text-xs"
          value={config}
          onChange={(e) => setConfig(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label className="mb-1.5">Интервал (мин)</Label>
          <Input
            value={intervalMinutes}
            onChange={(e) => setIntervalMinutes(e.target.value)}
            placeholder="пусто = только вручную"
            inputMode="numeric"
          />
        </div>
        <div className="flex items-end">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border bg-background"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Включён
          </label>
        </div>
      </div>

      <Button onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Сохраняем…' : initial ? 'Сохранить' : 'Создать источник'}
      </Button>
    </div>
  );
}
