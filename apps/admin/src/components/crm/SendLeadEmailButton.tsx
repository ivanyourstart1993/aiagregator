'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { sendEmailToLeadAction } from '@/app/[locale]/(panel)/crm/actions';
import { type OutreachTemplateView } from '@/lib/server-api';

interface Props {
  leadId: string;
  ownerEmail: string | null;
  templates: OutreachTemplateView[];
}

export function SendLeadEmailButton({ leadId, ownerEmail, templates }: Props) {
  const router = useRouter();
  const [, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'template' | 'custom'>('template');
  const [templateSlug, setTemplateSlug] = useState(templates[0]?.slug ?? '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  if (!ownerEmail) {
    return (
      <Button variant="outline" size="sm" disabled title="У лида нет email">
        ✉ Email
      </Button>
    );
  }

  async function handleSend() {
    if (mode === 'template' && !templateSlug) {
      toast.error('Выбери шаблон');
      return;
    }
    if (mode === 'custom' && (!subject.trim() || !body.trim())) {
      toast.error('Subject и body обязательны');
      return;
    }
    setSubmitting(true);
    start(async () => {
      const r = await sendEmailToLeadAction(leadId, {
        templateSlug: mode === 'template' ? templateSlug : undefined,
        subject: subject.trim() || undefined,
        body: mode === 'custom' ? body.trim() : undefined,
      });
      setSubmitting(false);
      if (r.ok) {
        toast.success(`Письмо в очереди → ${ownerEmail}`);
        setOpen(false);
        setSubject('');
        setBody('');
        router.refresh();
      } else {
        toast.error(`Ошибка: ${r.code ?? 'error'}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">✉ Email</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Отправить письмо</DialogTitle>
          <DialogDescription>
            Кому: <code className="font-mono">{ownerEmail}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode('template')}
            className={`rounded border px-3 py-1 ${
              mode === 'template'
                ? 'border-primary bg-primary/10'
                : 'border-border text-muted-foreground'
            }`}
          >
            По шаблону
          </button>
          <button
            type="button"
            onClick={() => setMode('custom')}
            className={`rounded border px-3 py-1 ${
              mode === 'custom'
                ? 'border-primary bg-primary/10'
                : 'border-border text-muted-foreground'
            }`}
          >
            Произвольное
          </button>
        </div>

        {mode === 'template' ? (
          <>
            <div>
              <Label className="mb-1.5">Шаблон</Label>
              {templates.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Сначала создай шаблон в /crm/templates
                </p>
              ) : (
                <Select value={templateSlug} onValueChange={setTemplateSlug}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.slug} value={t.slug}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label className="mb-1.5">Subject (опционально)</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={`Quick question about ${ownerEmail.split('@')[0]}`}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <Label className="mb-1.5">Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5">Тело письма</Label>
              <Textarea
                rows={8}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Привет, {{ownerName}}…"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Поддерживается {'{{name}}'}, {'{{ownerName}}'}, {'{{type}}'}, {'{{url}}'}.
                Подпись с unsubscribe-ссылкой добавится автоматически.
              </p>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button onClick={handleSend} disabled={submitting}>
            {submitting ? 'Отправляем…' : 'Отправить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
