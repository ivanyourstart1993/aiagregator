'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  type ProviderAccountView,
  type ProviderAdminView,
  type ProxyView,
} from '@/lib/server-api';
import {
  createProviderAccountAction,
  updateProviderAccountAction,
} from '@/app/[locale]/(admin)/admin/providers/actions';

interface Props {
  mode: 'create' | 'edit';
  account?: ProviderAccountView;
  providers: ProviderAdminView[];
  proxies: ProxyView[];
}

export function AccountForm({ mode, account, providers, proxies }: Props) {
  const t = useTranslations('admin.providers.accounts');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('admin.coupons.form');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [providerId, setProviderId] = useState(account?.providerId ?? providers[0]?.id ?? '');
  const [name, setName] = useState(account?.name ?? '');
  const [description, setDescription] = useState(account?.description ?? '');
  const [credentials, setCredentials] = useState('{}');
  const [proxyId, setProxyId] = useState<string>(account?.proxyId ?? '');
  const [dailyLimit, setDailyLimit] = useState(account?.dailyLimit?.toString() ?? '');
  const [monthlyLimit, setMonthlyLimit] = useState(account?.monthlyLimit?.toString() ?? '');
  const [maxConcurrent, setMaxConcurrent] = useState(
    account?.maxConcurrentTasks?.toString() ?? '',
  );
  const [supportedModels, setSupportedModels] = useState(
    (account?.supportedModelIds ?? []).join(','),
  );
  const [supportedMethods, setSupportedMethods] = useState(
    (account?.supportedMethodIds ?? []).join(','),
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let creds: Record<string, unknown> = {};
    if (mode === 'create' || credentials.trim() !== '{}') {
      try {
        creds = JSON.parse(credentials || '{}');
      } catch {
        toast.error(tForm('jsonInvalid'));
        return;
      }
    }
    const body = {
      name: name.trim(),
      description: description.trim() || undefined,
      proxyId: proxyId || null,
      dailyLimit: dailyLimit ? Number(dailyLimit) : null,
      monthlyLimit: monthlyLimit ? Number(monthlyLimit) : null,
      maxConcurrentTasks: maxConcurrent ? Number(maxConcurrent) : null,
      supportedModelIds: supportedModels
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      supportedMethodIds: supportedMethods
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };

    startTransition(async () => {
      const res =
        mode === 'create'
          ? await createProviderAccountAction({
              ...body,
              providerId,
              credentials: creds,
            })
          : await updateProviderAccountAction(account!.id, {
              ...body,
              ...(credentials.trim() !== '{}' ? { credentials: creds } : {}),
            });
      if (res.ok) {
        toast.success(t('saved'));
        router.push('/admin/providers/accounts');
      } else {
        toast.error(t('saveFailed'));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>{t('fieldProvider')}</Label>
        <Select value={providerId} onValueChange={setProviderId} disabled={mode === 'edit'}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.publicName} ({p.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{t('fieldName')}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="space-y-2">
        <Label>{t('fieldDescription')}</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>{t('fieldCredentials')}</Label>
        <Textarea
          value={credentials}
          onChange={(e) => setCredentials(e.target.value)}
          rows={6}
          className="font-mono text-xs"
          placeholder='{"apiKey":"..."}'
        />
      </div>

      <div className="space-y-2">
        <Label>{t('fieldProxy')}</Label>
        <Select value={proxyId || '__none__'} onValueChange={(v) => setProxyId(v === '__none__' ? '' : v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">{t('fieldNoProxy')}</SelectItem>
            {proxies.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({p.host}:{p.port})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>{t('fieldDailyLimit')}</Label>
          <Input
            type="number"
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('fieldMonthlyLimit')}</Label>
          <Input
            type="number"
            value={monthlyLimit}
            onChange={(e) => setMonthlyLimit(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('fieldMaxConcurrent')}</Label>
          <Input
            type="number"
            value={maxConcurrent}
            onChange={(e) => setMaxConcurrent(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('fieldSupportedModels')}</Label>
        <Input value={supportedModels} onChange={(e) => setSupportedModels(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>{t('fieldSupportedMethods')}</Label>
        <Input value={supportedMethods} onChange={(e) => setSupportedMethods(e.target.value)} />
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
