'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createEmailCampaignAction } from '@/app/[locale]/(panel)/crm/actions';
import {
  type LeadStatus,
  type LeadType,
  type OutreachTemplateView,
} from '@/lib/server-api';

interface SourceOption {
  id: string;
  name: string;
}

interface Props {
  templates: OutreachTemplateView[];
  sources: SourceOption[];
  onCreated?: () => void;
}

const TYPE_OPTIONS: { value: LeadType | ''; label: string }[] = [
  { value: '', label: 'Все типы' },
  { value: 'TELEGRAM_CHANNEL', label: 'TG канал' },
  { value: 'MOBILE_APP_IOS', label: 'iOS app' },
  { value: 'MOBILE_APP_ANDROID', label: 'Android app' },
  { value: 'WEBSITE', label: 'Сайт' },
  { value: 'OTHER', label: 'Другое' },
];

const STATUS_OPTIONS: { value: LeadStatus | ''; label: string }[] = [
  { value: '', label: 'Все статусы' },
  { value: 'NEW', label: 'NEW' },
  { value: 'ENRICHED', label: 'ENRICHED' },
  { value: 'READY', label: 'READY' },
];

export function EmailCampaignForm({ templates, sources, onCreated }: Props) {
  const router = useRouter();
  const [, start] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('Quick question about {{name}}');
  const [templateSlug, setTemplateSlug] = useState(templates[0]?.slug ?? '');
  const [type, setType] = useState<string>('');
  const [status, setStatus] = useState<string>('NEW');
  const [sourceId, setSourceId] = useState<string>('');
  const [minScore, setMinScore] = useState('70');
  const [hourlyCap, setHourlyCap] = useState('20');

  useEffect(() => {
    if (!templateSlug && templates[0]) setTemplateSlug(templates[0].slug);
  }, [templates, templateSlug]);

  async function handleSubmit() {
    if (!name.trim() || !subject.trim() || !templateSlug) {
      toast.error('Имя, subject и шаблон обязательны');
      return;
    }
    const minScoreNum = minScore.trim() ? Number(minScore.trim()) : undefined;
    if (minScoreNum != null && (!Number.isFinite(minScoreNum) || minScoreNum < 0 || minScoreNum > 100)) {
      toast.error('minScore должен быть 0-100');
      return;
    }
    const cap = Number(hourlyCap.trim()) || 20;

    setSubmitting(true);
    start(async () => {
      const r = await createEmailCampaignAction({
        name: name.trim(),
        templateSlug,
        subject: subject.trim(),
        audienceFilter: {
          ...(type ? { type: type as LeadType } : {}),
          ...(status ? { status: status as LeadStatus } : {}),
          ...(sourceId ? { sourceId } : {}),
          ...(minScoreNum != null ? { minScore: minScoreNum } : {}),
        },
        hourlyCap: cap,
      });
      setSubmitting(false);
      if (r.ok) {
        toast.success('Кампания создана');
        setName('');
        router.refresh();
        onCreated?.();
      } else {
        toast.error(`Ошибка: ${r.code ?? 'error'}`);
      }
    });
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/50 p-4 text-sm text-muted-foreground">
        Нет шаблонов. Создай хотя бы один в{' '}
        <a className="underline" href="/ru/crm/templates">
          /crm/templates
        </a>
        .
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="mb-1.5">Название кампании</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="напр. AI app developers — first touch"
        />
      </div>

      <div>
        <Label className="mb-1.5">Subject (поддерживает {'{{name}}'}, {'{{ownerName}}'} и т.д.)</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>

      <div>
        <Label className="mb-1.5">Шаблон письма</Label>
        <Select value={templateSlug} onValueChange={setTemplateSlug}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.slug} value={t.slug}>
                {t.name} <span className="text-muted-foreground">({t.slug})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-border bg-muted/20 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Аудитория (фильтр лидов — лиды без email пропускаются автоматически)
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label className="mb-1.5">Тип лида</Label>
            <Select value={type || '__all'} onValueChange={(v) => setType(v === '__all' ? '' : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value || '__all'} value={o.value || '__all'}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5">Статус</Label>
            <Select value={status || '__all'} onValueChange={(v) => setStatus(v === '__all' ? '' : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value || '__all'} value={o.value || '__all'}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5">Источник</Label>
            <Select value={sourceId || '__all'} onValueChange={(v) => setSourceId(v === '__all' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Любой" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Любой источник</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5">Минимальный score (0-100)</Label>
            <Input
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              inputMode="numeric"
            />
          </div>
        </div>
      </div>

      <div>
        <Label className="mb-1.5">Лимит писем в час (warmup-friendly)</Label>
        <Input
          value={hourlyCap}
          onChange={(e) => setHourlyCap(e.target.value)}
          inputMode="numeric"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Воркер растягивает рассылку: при cap=20 первые 20 писем уйдут в течение часа,
          следующие 20 — в течение второго часа, и т.д. На старте бери 10-20.
        </p>
      </div>

      <Button onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Создаём…' : 'Создать кампанию (черновик)'}
      </Button>
    </div>
  );
}
