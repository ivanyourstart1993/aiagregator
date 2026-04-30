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
  type ProviderAccountView,
  type ProviderAdminView,
  type ProxyView,
} from '@/lib/server-api';
import {
  createProviderAccountAction,
  updateProviderAccountAction,
  deleteProviderAccountAction,
} from '@/app/[locale]/(panel)/providers/actions';

interface Props {
  mode: 'create' | 'edit';
  account?: ProviderAccountView;
  providers: ProviderAdminView[];
  proxies: ProxyView[];
}

export function AccountForm({ mode, account, providers, proxies }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [providerId, setProviderId] = useState(
    account?.providerId ?? providers[0]?.id ?? '',
  );
  const [name, setName] = useState(account?.name ?? '');
  const [description, setDescription] = useState(account?.description ?? '');
  const [credentials, setCredentials] = useState('{}');
  const [proxyId, setProxyId] = useState<string>(account?.proxyId ?? '');
  const [dailyLimit, setDailyLimit] = useState(
    account?.dailyLimit?.toString() ?? '',
  );
  const [monthlyLimit, setMonthlyLimit] = useState(
    account?.monthlyLimit?.toString() ?? '',
  );
  const [maxConcurrent, setMaxConcurrent] = useState(
    account?.maxConcurrentTasks?.toString() ?? '',
  );
  const [supportedModels, setSupportedModels] = useState(
    (account?.supportedModelIds ?? []).join(','),
  );
  const [supportedMethods, setSupportedMethods] = useState(
    (account?.supportedMethodIds ?? []).join(','),
  );
  const [acquisitionCostUsd, setAcquisitionCostUsd] = useState(
    account?.acquisitionCostUnits != null && account.acquisitionCostUnits !== '0'
      ? (Number(account.acquisitionCostUnits) / 1_000_000_000).toString()
      : '',
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let creds: Record<string, unknown> = {};
    if (mode === 'create' || credentials.trim() !== '{}') {
      try {
        creds = JSON.parse(credentials || '{}');
      } catch {
        toast.error('Невалидный JSON в credentials');
        return;
      }
    }

    if (!proxyId) {
      // Soft warning — server will accept null, but we strongly suggest a proxy.
      const ok = confirm(
        'Прокси не выбран. Запросы пойдут с публичного IP Northflank — это сильный fingerprint signal для Google. Продолжить без прокси?',
      );
      if (!ok) return;
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
      acquisitionCostUsd: acquisitionCostUsd ? Number(acquisitionCostUsd) : 0,
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
        toast.success('Сохранено');
        router.push('/providers/accounts');
        router.refresh();
      } else {
        toast.error(`Ошибка: ${res.code ?? 'unknown'}`);
      }
    });
  }

  function handleDelete() {
    if (!account) return;
    if (
      !confirm(
        `Удалить аккаунт "${account.name}"? Все ProviderAttempts и Transaction (агрегаты ROI) останутся как историческая запись.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteProviderAccountAction(account.id);
      if (res.ok) {
        toast.success('Удалено');
        router.push('/providers/accounts');
        router.refresh();
      } else {
        toast.error(`Ошибка: ${res.code ?? 'unknown'}`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Провайдер</Label>
        <Select
          value={providerId}
          onValueChange={setProviderId}
          disabled={mode === 'edit'}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.publicName ?? p.code} ({p.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Имя</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="например: google-trial-01"
        />
      </div>

      <div className="space-y-2">
        <Label>Описание</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>
          Credentials (JSON)
          {mode === 'edit' && (
            <span className="ml-2 text-xs text-muted-foreground">
              Оставь {'{}'} чтобы не менять
            </span>
          )}
        </Label>
        <Textarea
          value={credentials}
          onChange={(e) => setCredentials(e.target.value)}
          rows={6}
          className="font-mono text-xs"
          placeholder='{"apiKey":"AIza..."}  или {"serviceAccount":{...}}'
        />
      </div>

      <div className="space-y-2">
        <Label>
          Прокси
          <span className="ml-2 text-xs text-yellow-500">
            Для Google аккаунтов критически рекомендуется
          </span>
        </Label>
        <Select
          value={proxyId || '__none__'}
          onValueChange={(v) => setProxyId(v === '__none__' ? '' : v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— без прокси (риск!) —</SelectItem>
            {proxies.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({p.host}:{p.port}) {p.country ? `· ${p.country}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Дневной лимит</Label>
          <Input
            type="number"
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
            placeholder="100"
          />
        </div>
        <div className="space-y-2">
          <Label>Месячный лимит</Label>
          <Input
            type="number"
            value={monthlyLimit}
            onChange={(e) => setMonthlyLimit(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Max concurrent</Label>
          <Input
            type="number"
            value={maxConcurrent}
            onChange={(e) => setMaxConcurrent(e.target.value)}
            placeholder="3"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>
          Supported model IDs (через запятую)
          <span className="ml-2 text-xs text-muted-foreground">
            пусто = все из каталога
          </span>
        </Label>
        <Input
          value={supportedModels}
          onChange={(e) => setSupportedModels(e.target.value)}
          placeholder=""
        />
      </div>

      <div className="space-y-2">
        <Label>
          Supported method IDs (через запятую)
          <span className="ml-2 text-xs text-muted-foreground">
            пусто = все из каталога
          </span>
        </Label>
        <Input
          value={supportedMethods}
          onChange={(e) => setSupportedMethods(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>
          Стоимость аккаунта (USD)
          <span className="ml-2 text-xs text-muted-foreground">
            Сколько потрачено на покупку (карта/SIM/ключ). Используется для ROI.
          </span>
        </Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          placeholder="35"
          value={acquisitionCostUsd}
          onChange={(e) => setAcquisitionCostUsd(e.target.value)}
        />
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
