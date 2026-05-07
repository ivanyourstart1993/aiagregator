'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  deleteEmailCampaignAction,
  pauseEmailCampaignAction,
  runEmailCampaignAction,
} from '@/app/[locale]/(panel)/crm/actions';
import { type EmailCampaignStatusValue } from '@/lib/server-api';

export function EmailCampaignRowActions({
  id,
  status,
}: {
  id: string;
  status: EmailCampaignStatusValue;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const r = await runEmailCampaignAction(id);
      if (r.ok) {
        const d = r.data;
        toast.success(
          `Поставлено в очередь: ${d?.queued ?? 0} (пропущено: ${d?.skipped ?? 0} из ${d?.audienceSize ?? 0})`,
        );
        router.refresh();
      } else {
        toast.error(`Ошибка: ${r.code ?? 'error'}`);
      }
    });
  }

  function pause() {
    start(async () => {
      const r = await pauseEmailCampaignAction(id);
      if (r.ok) {
        toast.success('Поставлено на паузу');
        router.refresh();
      } else {
        toast.error(`Ошибка: ${r.code ?? 'error'}`);
      }
    });
  }

  function remove() {
    start(async () => {
      const r = await deleteEmailCampaignAction(id);
      if (r.ok) {
        toast.success('Удалено');
        router.refresh();
      } else {
        toast.error(`Ошибка: ${r.code ?? 'error'}`);
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {status === 'DRAFT' || status === 'PAUSED' ? (
        <Button size="sm" variant="outline" onClick={run} disabled={pending}>
          {pending ? '...' : status === 'PAUSED' ? '▶ Возобновить' : '▶ Запустить'}
        </Button>
      ) : null}
      {status === 'RUNNING' ? (
        <Button size="sm" variant="ghost" onClick={pause} disabled={pending}>
          ⏸ Пауза
        </Button>
      ) : null}
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="ghost" className="text-destructive">
            Удалить
          </Button>
        }
        title="Удалить кампанию?"
        description="История доставок останется, но саму кампанию уже не запустить."
        confirmLabel="Удалить"
        variant="destructive"
        onConfirm={remove}
      />
    </div>
  );
}
