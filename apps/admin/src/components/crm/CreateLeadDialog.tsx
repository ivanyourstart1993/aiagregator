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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createLeadAction } from '@/app/[locale]/(panel)/crm/actions';
import { type LeadType } from '@/lib/server-api';

const TYPE_OPTIONS: { value: LeadType; label: string }[] = [
  { value: 'TELEGRAM_CHANNEL', label: 'Telegram канал' },
  { value: 'MOBILE_APP_IOS', label: 'iOS приложение' },
  { value: 'MOBILE_APP_ANDROID', label: 'Android приложение' },
  { value: 'WEBSITE', label: 'Сайт' },
  { value: 'OTHER', label: 'Другое' },
];

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function CreateLeadDialog() {
  const router = useRouter();
  const [, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [type, setType] = useState<LeadType>('TELEGRAM_CHANNEL');
  const [name, setName] = useState('');
  const [externalId, setExternalId] = useState('');
  const [url, setUrl] = useState('');
  const [telegramUsername, setTelegramUsername] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [score, setScore] = useState('');

  function reset() {
    setType('TELEGRAM_CHANNEL');
    setName('');
    setExternalId('');
    setUrl('');
    setTelegramUsername('');
    setOwnerEmail('');
    setOwnerName('');
    setScore('');
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error('Имя обязательно');
      return;
    }
    const eid = externalId.trim() || `manual-${slugify(name)}-${Date.now()}`;
    const tg = telegramUsername.trim().replace(/^@/, '');
    const scoreNum = score.trim() ? Number(score.trim()) : 0;
    if (score.trim() && (!Number.isInteger(scoreNum) || scoreNum < 0 || scoreNum > 100)) {
      toast.error('Score должен быть целым 0-100');
      return;
    }
    setSubmitting(true);
    start(async () => {
      const r = await createLeadAction({
        type,
        externalId: eid,
        name: name.trim(),
        url: url.trim() || undefined,
        telegramUsername: tg || undefined,
        ownerEmail: ownerEmail.trim() || undefined,
        ownerName: ownerName.trim() || undefined,
        score: scoreNum || undefined,
      });
      setSubmitting(false);
      if (r.ok) {
        toast.success('Лид создан');
        reset();
        setOpen(false);
        router.refresh();
      } else {
        toast.error(`Ошибка: ${r.code ?? 'error'}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ Создать лид</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Новый лид</DialogTitle>
          <DialogDescription>
            Ручное добавление. Карточка попадёт в колонку «Новый».
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-1.5">Тип</Label>
            <Select value={type} onValueChange={(v) => setType(v as LeadType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5">Название *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="напр. AI Art Generator или @aineuro"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label className="mb-1.5">URL</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://t.me/... или https://apps.apple.com/..."
              />
            </div>
            <div>
              <Label className="mb-1.5">Telegram @username</Label>
              <Input
                value={telegramUsername}
                onChange={(e) => setTelegramUsername(e.target.value)}
                placeholder="без @ — например durov"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label className="mb-1.5">Email владельца</Label>
              <Input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5">Имя владельца</Label>
              <Input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label className="mb-1.5">External ID</Label>
              <Input
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                placeholder="auto, если пусто"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Уникальный идентификатор в источнике. Если пусто — сгенерится автоматически.
              </p>
            </div>
            <div>
              <Label className="mb-1.5">Score (0-100)</Label>
              <Input
                value={score}
                onChange={(e) => setScore(e.target.value)}
                inputMode="numeric"
                placeholder="0"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Создаём…' : 'Создать лид'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
