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
import type { ProxyProtocol, ProxyStatus, ProxyView } from '@/lib/server-api';
import {
  createProxyAction,
  updateProxyAction,
  deleteProxyAction,
} from '@/app/[locale]/(panel)/providers/actions';

interface Props {
  mode: 'create' | 'edit';
  proxy?: ProxyView;
}

const PROTOCOLS: ProxyProtocol[] = ['HTTP', 'HTTPS', 'SOCKS5'];
const STATUSES: ProxyStatus[] = ['ACTIVE', 'DISABLED', 'BROKEN'];

export function ProxyForm({ mode, proxy }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(proxy?.name ?? '');
  const [host, setHost] = useState(proxy?.host ?? '');
  const [port, setPort] = useState(proxy?.port?.toString() ?? '');
  const [protocol, setProtocol] = useState<ProxyProtocol>(proxy?.protocol ?? 'HTTP');
  const [login, setLogin] = useState(proxy?.login ?? '');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState(proxy?.country ?? '');
  const [region, setRegion] = useState(proxy?.region ?? '');
  const [status, setStatus] = useState<ProxyStatus>(proxy?.status ?? 'ACTIVE');

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const portNum = Number(port);
    if (!Number.isFinite(portNum)) {
      toast.error('Порт должен быть числом');
      return;
    }
    const body = {
      name: name.trim(),
      host: host.trim(),
      port: portNum,
      protocol,
      login: login.trim() || undefined,
      ...(password ? { password } : {}),
      country: country.trim() || undefined,
      region: region.trim() || undefined,
      status,
    };

    startTransition(async () => {
      const res =
        mode === 'create'
          ? await createProxyAction(body)
          : await updateProxyAction(proxy!.id, body);
      if (res.ok) {
        toast.success('Сохранено');
        router.push('/providers/proxies');
        router.refresh();
      } else {
        toast.error(`Ошибка: ${res.code ?? 'unknown'}`);
      }
    });
  }

  function handleDelete() {
    if (!proxy) return;
    if (!confirm(`Удалить прокси "${proxy.name}"?`)) return;
    startTransition(async () => {
      const res = await deleteProxyAction(proxy.id);
      if (res.ok) {
        toast.success('Удалено');
        router.push('/providers/proxies');
        router.refresh();
      } else {
        toast.error(`Ошибка: ${res.code ?? 'unknown'}`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Название</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="например: Istanbul DC IP"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-2 sm:col-span-2">
          <Label>Host</Label>
          <Input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            required
            placeholder="82.47.120.113"
          />
        </div>
        <div className="space-y-2">
          <Label>Port</Label>
          <Input
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            required
            placeholder="50100"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Протокол</Label>
          <Select
            value={protocol}
            onValueChange={(v) => setProtocol(v as ProxyProtocol)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROTOCOLS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Статус</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as ProxyStatus)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Логин (опционально)</Label>
          <Input value={login} onChange={(e) => setLogin(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>
            Пароль
            {mode === 'edit' && proxy?.passwordLast4
              ? ` — текущий ••••${proxy.passwordLast4}`
              : ''}
          </Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'edit' ? 'Оставь пустым чтобы не менять' : ''}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Страна (ISO-2, опц.)</Label>
          <Input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="TR"
          />
        </div>
        <div className="space-y-2">
          <Label>Регион (опц.)</Label>
          <Input value={region} onChange={(e) => setRegion(e.target.value)} />
        </div>
      </div>

      <div className="flex justify-between gap-2 pt-2">
        <div>
          {mode === 'edit' && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              Удалить
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={pending}
          >
            Отмена
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </form>
  );
}
