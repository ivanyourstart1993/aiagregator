'use client';

import { useState, useTransition } from 'react';
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
import { createOutreachAccountAction } from '@/app/[locale]/(panel)/crm/actions';

interface ProxyOption {
  id: string;
  name: string;
  country: string | null;
}

export function OutreachAccountForm({ proxies }: { proxies: ProxyOption[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [proxyId, setProxyId] = useState<string>('');
  const [dailyLimit, setDailyLimit] = useState('20');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !phone.trim() || !apiId.trim() || !apiHash.trim()) {
      toast.error('Все поля кроме прокси обязательны');
      return;
    }
    const apiIdNum = Number(apiId.trim());
    if (!Number.isInteger(apiIdNum) || apiIdNum < 1) {
      toast.error('api_id должен быть целым числом');
      return;
    }
    const limit = Number(dailyLimit.trim()) || 20;
    setSubmitting(true);
    start(async () => {
      const r = await createOutreachAccountAction({
        name: name.trim(),
        phone: phone.trim(),
        apiId: apiIdNum,
        apiHash: apiHash.trim(),
        proxyId: proxyId || null,
        dailyLimit: limit,
      });
      setSubmitting(false);
      if (r.ok) {
        toast.success('Аккаунт добавлен. Залогиньтесь через Telethon-сервис.');
        setName('');
        setPhone('');
        setApiId('');
        setApiHash('');
        setProxyId('');
        setDailyLimit('20');
        router.refresh();
      } else {
        toast.error(`Ошибка: ${r.code}`);
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Получите <code className="rounded bg-muted px-1">api_id</code> и{' '}
        <code className="rounded bg-muted px-1">api_hash</code> на{' '}
        <a
          href="https://my.telegram.org"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          my.telegram.org
        </a>
        . Один номер = один аккаунт. После добавления нужно залогиниться через
        Telethon-сервис (sms-код приходит в Telegram).
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label className="mb-1.5">Название</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="напр. tg-bot-1 (Berlin)"
          />
        </div>
        <div>
          <Label className="mb-1.5">Телефон (международный, +)</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+491234567890"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label className="mb-1.5">api_id</Label>
          <Input
            value={apiId}
            onChange={(e) => setApiId(e.target.value)}
            placeholder="1234567"
            inputMode="numeric"
          />
        </div>
        <div>
          <Label className="mb-1.5">api_hash</Label>
          <Input
            value={apiHash}
            onChange={(e) => setApiHash(e.target.value)}
            placeholder="abc123…"
            type="password"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label className="mb-1.5">Прокси (по желанию)</Label>
          <Select value={proxyId} onValueChange={setProxyId}>
            <SelectTrigger>
              <SelectValue placeholder="Без прокси" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Без прокси</SelectItem>
              {proxies.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} {p.country ? `(${p.country})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1.5">Лимит/день</Label>
          <Input
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
            inputMode="numeric"
          />
        </div>
      </div>

      <Button onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Добавляем…' : 'Добавить аккаунт'}
      </Button>
    </div>
  );
}
