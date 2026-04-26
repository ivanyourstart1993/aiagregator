'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
} from '@/app/[locale]/(admin)/admin/providers/actions';

interface Props {
  mode: 'create' | 'edit';
  proxy?: ProxyView;
}

const PROTOCOLS: ProxyProtocol[] = ['HTTP', 'HTTPS', 'SOCKS5'];
const STATUSES: ProxyStatus[] = ['ACTIVE', 'DISABLED', 'BROKEN'];

export function ProxyForm({ mode, proxy }: Props) {
  const t = useTranslations('admin.providers.proxies');
  const tCommon = useTranslations('common');
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
    if (!Number.isFinite(portNum)) return;
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
        toast.success(t('saved'));
        router.push('/admin/providers/proxies');
      } else {
        toast.error(t('saveFailed'));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>{t('fieldName')}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-2 sm:col-span-2">
          <Label>{t('fieldHost')}</Label>
          <Input value={host} onChange={(e) => setHost(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>{t('fieldPort')}</Label>
          <Input
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t('fieldProtocol')}</Label>
          <Select value={protocol} onValueChange={(v) => setProtocol(v as ProxyProtocol)}>
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
          <Label>{t('fieldStatus')}</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ProxyStatus)}>
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
          <Label>{t('fieldLogin')}</Label>
          <Input value={login} onChange={(e) => setLogin(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>
            {t('fieldPassword')}
            {mode === 'edit' && proxy?.passwordLast4
              ? ` — ${t('passwordMasked')} ••••${proxy.passwordLast4}`
              : ''}
          </Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t('fieldCountry')}</Label>
          <Input value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t('fieldRegion')}</Label>
          <Input value={region} onChange={(e) => setRegion(e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {tCommon('cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? tCommon('loading') : tCommon('save')}
        </Button>
      </div>
    </form>
  );
}
