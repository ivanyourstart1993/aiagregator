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
  cloneProviderAccountAction,
  createProviderAccountAction,
  updateProviderAccountAction,
  deleteProviderAccountAction,
} from '@/app/[locale]/(panel)/providers/actions';
import { ConfirmDialog } from '@/components/ConfirmDialog';

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
  const selectedProvider = providers.find((p) => p.id === providerId);
  const providerCode = selectedProvider?.code ?? '';
  const isKling = providerCode === 'kling_ai';
  const isGoogle = providerCode === 'google_banana' || providerCode === 'google_veo';

  const [name, setName] = useState(account?.name ?? '');
  const [description, setDescription] = useState(account?.description ?? '');
  const [credentials, setCredentials] = useState('{}');
  const [klingApiKey, setKlingApiKey] = useState('');
  const [klingAccessKey, setKlingAccessKey] = useState('');
  const [klingSecretKey, setKlingSecretKey] = useState('');
  // For "1 SA, 2 Google providers" pattern. Only meaningful at create time
  // and when the selected provider is google_banana or google_veo. Default
  // ON because the typical SA is configured for both.
  const [alsoCloneForVeoBanana, setAlsoCloneForVeoBanana] = useState(true);
  const siblingProviderCode =
    providerCode === 'google_banana'
      ? 'google_veo'
      : providerCode === 'google_veo'
        ? 'google_banana'
        : null;
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
    let credsTouched = false;
    if (isKling) {
      const apiKey = klingApiKey.trim();
      const ak = klingAccessKey.trim();
      const sk = klingSecretKey.trim();
      if (apiKey) {
        // New single API Key format (preferred; required for new Kling models).
        creds = { api_key: apiKey };
        credsTouched = true;
      } else if (mode === 'create') {
        if (!ak || !sk) {
          toast.error(
            'Заполни API Key (новый формат) ИЛИ Access Key + Secret Key',
          );
          return;
        }
        creds = { access_key: ak, secret_key: sk };
        credsTouched = true;
      } else if (ak || sk) {
        if (!ak || !sk) {
          toast.error(
            'Чтобы сменить legacy-ключи — заполни оба поля (или укажи API Key выше)',
          );
          return;
        }
        creds = { access_key: ak, secret_key: sk };
        credsTouched = true;
      }
    } else if (mode === 'create' || credentials.trim() !== '{}') {
      try {
        creds = JSON.parse(credentials || '{}');
      } catch {
        toast.error('Невалидный JSON в credentials');
        return;
      }
      credsTouched = true;
    }

    if (!proxyId && isGoogle) {
      // Soft warning — server will accept null, but we strongly suggest a proxy for Google.
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
              ...(credsTouched ? { credentials: creds } : {}),
            });
      if (res.ok) {
        // After a successful create, optionally clone to the sibling Google
        // provider so one form submission spawns both banana + veo accounts.
        if (
          mode === 'create' &&
          isGoogle &&
          alsoCloneForVeoBanana &&
          siblingProviderCode &&
          res.data?.id
        ) {
          const cl = await cloneProviderAccountAction(res.data.id, {
            providerCode: siblingProviderCode,
          });
          if (cl.ok) {
            toast.success(
              `Сохранено + клон под ${siblingProviderCode} создан`,
            );
          } else {
            toast.warning(
              `Аккаунт сохранён, но клон под ${siblingProviderCode} не создался: ${cl.code ?? 'unknown'}`,
            );
          }
        } else {
          toast.success('Сохранено');
        }
        router.push('/providers/accounts');
        router.refresh();
      } else {
        toast.error(`Ошибка: ${res.code ?? 'unknown'}`);
      }
    });
  }

  function handleDelete() {
    if (!account) return;
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

      {isKling ? (
        <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Kling AI · ключи доступа</Label>
            <a
              href="https://app.klingai.com/global/dev/document-api/quickStart/keyAccess"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              где взять ключи?
            </a>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              API Key (новый формат)
            </Label>
            <Input
              type="password"
              value={klingApiKey}
              onChange={(e) => setKlingApiKey(e.target.value)}
              placeholder={
                mode === 'edit'
                  ? 'оставь пустым чтобы не менять'
                  : 'новый ключ Kling (Bearer)'
              }
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Новый формат Kling — нужен для новых моделей. Если задан, сохранится
              как{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                {'{api_key}'}
              </code>{' '}
              и имеет приоритет над Access/Secret Key ниже.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Access Key{' '}
              <span className="text-muted-foreground/70">(legacy)</span>
            </Label>
            <Input
              value={klingAccessKey}
              onChange={(e) => setKlingAccessKey(e.target.value)}
              placeholder={
                mode === 'edit' ? 'оставь пустым чтобы не менять' : 'AN...'
              }
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Secret Key</Label>
            <Input
              type="password"
              value={klingSecretKey}
              onChange={(e) => setKlingSecretKey(e.target.value)}
              placeholder={
                mode === 'edit' ? 'оставь пустым чтобы не менять' : 'Ah...'
              }
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Legacy-формат: сохранится как{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
              {'{access_key, secret_key}'}
            </code>
            , адаптер подписывает HS256-JWT. Работает только для старых моделей.
            Для новых моделей задай API Key выше.
          </p>
        </div>
      ) : isGoogle ? (
        <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
          <Label>
            Google · Service Account JSON
            {mode === 'edit' && (
              <span className="ml-2 text-xs text-muted-foreground">
                Оставь {'{}'} чтобы не менять
              </span>
            )}
          </Label>
          <Textarea
            value={credentials}
            onChange={(e) => setCredentials(e.target.value)}
            rows={10}
            className="font-mono text-xs"
            placeholder='Вставь весь JSON, скачанный из Google Cloud Console: {"type":"service_account","project_id":"...","private_key":"-----BEGIN...","client_email":"...","..."}'
          />
          <p className="text-xs text-muted-foreground">
            Можно вставить файл SA <em>как есть</em> — оборачивать в{' '}
            <code className="font-mono text-[11px]">{'{ "serviceAccount": ... }'}</code>{' '}
            не нужно. Адаптер также принимает обёрнутый формат, если он уже сохранён.
            Альтернатива: <code className="font-mono text-[11px]">{'{ "apiKey": "AIza..." }'}</code>{' '}
            для AI Studio API key.
          </p>
        </div>
      ) : (
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
            placeholder='{"apiKey":"..."}'
          />
        </div>
      )}

      {mode === 'create' && isGoogle && siblingProviderCode ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
          <input
            type="checkbox"
            checked={alsoCloneForVeoBanana}
            onChange={(e) => setAlsoCloneForVeoBanana(e.target.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-info"
          />
          <span className="space-y-0.5 text-sm">
            <span className="block font-medium text-foreground">
              {siblingProviderCode === 'google_veo'
                ? 'Также использовать для Google Veo (видео)'
                : 'Также использовать для Google Banana (фото)'}
            </span>
            <span className="block text-xs text-muted-foreground">
              У Google один SA обычно работает и с {providerCode === 'google_banana' ? 'Veo' : 'Banana'}.
              Будет создан второй аккаунт с тем же ключом и прокси под{' '}
              <code className="font-mono text-[11px]">{siblingProviderCode}</code>.
              Можно отключить и подключить отдельно потом.
            </span>
          </span>
        </label>
      ) : null}

      <div className="space-y-2">
        <Label>
          Прокси
          {isGoogle ? (
            <span className="ml-2 text-xs text-yellow-500">
              Для Google аккаунтов критически рекомендуется
            </span>
          ) : (
            <span className="ml-2 text-xs text-muted-foreground">
              опционально
            </span>
          )}
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
          {mode === 'edit' && account && (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="destructive" disabled={pending}>
                  Удалить
                </Button>
              }
              title={`Удалить аккаунт "${account.name}"?`}
              description="Все ProviderAttempts и Transactions (агрегаты ROI) останутся как историческая запись. Балансировщик перестанет выбирать этот аккаунт."
              confirmLabel="Удалить"
              variant="destructive"
              onConfirm={handleDelete}
              pending={pending}
            />
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
