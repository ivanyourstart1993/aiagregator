'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  createTemplateAction,
  updateTemplateAction,
} from '@/app/[locale]/(panel)/crm/actions';
import { type LeadType, type OutreachTemplateView } from '@/lib/server-api';

const TYPE_OPTIONS: { value: LeadType; label: string }[] = [
  { value: 'TELEGRAM_CHANNEL', label: 'TG канал' },
  { value: 'MOBILE_APP_IOS', label: 'iOS app' },
  { value: 'MOBILE_APP_ANDROID', label: 'Android app' },
  { value: 'WEBSITE', label: 'Сайт' },
  { value: 'OTHER', label: 'Другое' },
];

const PLACEHOLDER = `Привет, {{ownerName}}!

Видел ваш {{type}} «{{name}}» — у вас интересный контент про AI-генерацию.

Мы запустили API-агрегатор aigenway.com — даём доступ к Google Banana, Veo и Kling в одном месте, дешевле прямого подключения. Подумал, может вашей аудитории это будет полезно: реферальная программа от 30%, бесплатный тестовый ключ.

Если интересно — отвечу на вопросы.`;

interface Props {
  initial?: OutreachTemplateView;
  onDone?: () => void;
}

export function TemplateForm({ initial, onDone }: Props) {
  const router = useRouter();
  const [, start] = useTransition();
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [body, setBody] = useState(initial?.body ?? PLACEHOLDER);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [targetTypes, setTargetTypes] = useState<LeadType[]>(
    initial?.targetTypes ?? [],
  );
  const [submitting, setSubmitting] = useState(false);

  function toggleType(t: LeadType) {
    setTargetTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  async function handleSubmit() {
    if (!slug.trim() || !name.trim() || !body.trim()) {
      toast.error('slug, имя и тело обязательны');
      return;
    }
    setSubmitting(true);
    start(async () => {
      const input = {
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        body,
        enabled,
        targetTypes,
      };
      const r = initial
        ? await updateTemplateAction(initial.id, input)
        : await createTemplateAction(input);
      setSubmitting(false);
      if (r.ok) {
        toast.success(initial ? 'Шаблон обновлён' : 'Шаблон создан');
        if (!initial) {
          setSlug('');
          setName('');
          setDescription('');
          setBody(PLACEHOLDER);
        }
        router.refresh();
        onDone?.();
      } else {
        toast.error(`Ошибка: ${r.code}`);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label className="mb-1.5">Slug (уникальный)</Label>
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="напр. first-touch-tg"
            disabled={!!initial}
          />
        </div>
        <div>
          <Label className="mb-1.5">Название</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="напр. Первое касание — TG канал"
          />
        </div>
      </div>

      <div>
        <Label className="mb-1.5">Описание (для команды)</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="когда применять, что в фокусе"
        />
      </div>

      <div>
        <Label className="mb-1.5">Тело шаблона</Label>
        <p className="mb-1 text-xs text-muted-foreground">
          Переменные: <code>{'{{name}}'}</code>, <code>{'{{ownerName}}'}</code>,{' '}
          <code>{'{{type}}'}</code>, <code>{'{{topic}}'}</code>,{' '}
          <code>{'{{url}}'}</code>
        </p>
        <Textarea
          rows={12}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      <div>
        <Label className="mb-1.5">Применимо к типам лидов</Label>
        <div className="flex flex-wrap gap-2">
          {TYPE_OPTIONS.map((t) => {
            const on = targetTypes.includes(t.value);
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => toggleType(t.value)}
                className={`rounded-md border px-3 py-1 text-xs transition-colors ${
                  on
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Пусто = применимо ко всем типам
        </p>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border bg-background"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Включён
      </label>

      <Button onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Сохраняем…' : initial ? 'Сохранить' : 'Создать шаблон'}
      </Button>
    </div>
  );
}
