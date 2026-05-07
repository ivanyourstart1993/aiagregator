'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { runSourceAction } from '@/app/[locale]/(panel)/crm/actions';

const KIND_BADGE: Record<string, string> = {
  ITUNES_SEARCH: '🍎 iTunes',
  PLAY_STORE_SEARCH: '🤖 Play',
  LYZEM_SEARCH: '💬 Lyzem',
  TGSTAT_SEARCH: '📊 TGStat',
  TELEGRAM_MENTIONS: '🔗 TG mentions',
  FACEBOOK_AD_LIBRARY: '📣 FB Ads',
  MANUAL: '✏️ Manual',
};

export function QuickRunSource({
  id,
  label,
  kind,
}: {
  id: string;
  label: string;
  kind: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function handleRun() {
    start(async () => {
      const r = await runSourceAction(id);
      if (r.ok) {
        toast.success(`Запущено: ${label}. Лиды появятся через 10-30 сек.`);
        // Soft refresh after 15s to pick up new leads
        setTimeout(() => router.refresh(), 15_000);
      } else {
        toast.error(`Ошибка: ${r.code ?? 'error'}`);
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={handleRun}
      className="font-normal"
    >
      <span className="mr-1.5 text-xs text-muted-foreground">
        {KIND_BADGE[kind] ?? kind}
      </span>
      {pending ? `${label} — запускаем…` : `▶ ${label}`}
    </Button>
  );
}
