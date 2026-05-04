import { getTranslations } from 'next-intl/server';
import { ApiError, serverApi, type SystemSettingView } from '@/lib/server-api';
import { SettingsTable } from '@/components/admin/settings/SettingsTable';
import { PauseToggles } from '@/components/admin/settings/PauseToggles';

async function safeSettings(): Promise<SystemSettingView[]> {
  try {
    const data = await serverApi.adminListSettings();
    return Array.isArray(data) ? data : data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function AdminSettingsPage() {
  const t = await getTranslations('admin.settings');
  const items = await safeSettings();
  const generationKey = items.find((s) => s.key === 'generation.queue.paused');
  const generationPaused = generationKey?.value === true;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <PauseToggles generationPaused={generationPaused} />

      <SettingsTable items={items} />
    </div>
  );
}
