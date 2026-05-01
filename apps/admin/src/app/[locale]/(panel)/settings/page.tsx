import { ApiError, serverApi, type SystemSettingView } from '@/lib/server-api';
import { PauseToggle } from '@/components/admin/PauseToggle';

interface ProviderRow {
  id: string;
  code: string;
  publicName?: string;
}

async function loadSettings(): Promise<SystemSettingView[]> {
  try {
    const r = await serverApi.adminListSettings();
    return Array.isArray(r) ? r : (r.items ?? []);
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

async function loadProviders(): Promise<ProviderRow[]> {
  try {
    const r = await serverApi.adminListProviders();
    return r as ProviderRow[];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

function isPaused(settings: SystemSettingView[], key: string): boolean {
  const s = settings.find((x) => x.key === key);
  if (!s) return false;
  if (typeof s.value === 'boolean') return s.value;
  if (typeof s.value === 'object' && s.value !== null) {
    const v = (s.value as { paused?: boolean }).paused;
    return Boolean(v);
  }
  return Boolean(s.value);
}

export default async function SettingsPage() {
  const [settings, providers] = await Promise.all([
    loadSettings(),
    loadProviders(),
  ]);

  const generationPaused = isPaused(settings, 'pause.generation');

  // Other settings (not handled by toggles above) — show as a flat key/value
  // table. Excludes the pause.* keys we render as toggles.
  const otherSettings = settings.filter(
    (s) =>
      !s.key.startsWith('pause.generation') &&
      !s.key.startsWith('pause.provider'),
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
        <p className="text-sm text-muted-foreground">
          Глобальные тумблеры и системные параметры
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Очереди
        </h2>
        <PauseToggle
          kind="queue"
          target="generation"
          initialPaused={generationPaused}
          label="Очередь генераций"
          description="Если на паузе — новые задачи копятся в очереди, но воркер их не подхватывает"
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Провайдеры
        </h2>
        {providers.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            Провайдеры в каталоге не найдены
          </div>
        ) : (
          providers.map((p) => {
            const paused = isPaused(settings, `pause.provider.${p.code}`);
            return (
              <PauseToggle
                key={p.id}
                kind="provider"
                target={p.code}
                initialPaused={paused}
                label={p.publicName ?? p.code}
                description={`Код: ${p.code}. На паузе → балансировщик не выбирает аккаунты этого провайдера`}
              />
            );
          })
        )}
      </section>

      {otherSettings.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Прочие настройки
          </h2>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-muted/30 uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Ключ</th>
                  <th className="px-4 py-3 text-left">Значение</th>
                  <th className="px-4 py-3 text-left">Комментарий</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {otherSettings.map((s) => (
                  <tr key={s.key}>
                    <td className="px-4 py-3 font-mono whitespace-nowrap">{s.key}</td>
                    <td className="px-4 py-3 font-mono">
                      {JSON.stringify(s.value)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.comment ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Редактирование произвольных настроек: PUT
            /internal/admin/settings/&lt;key&gt;
          </p>
        </section>
      )}
    </div>
  );
}
