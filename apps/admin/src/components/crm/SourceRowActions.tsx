'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  deleteSourceAction,
  runSourceAction,
  updateSourceAction,
} from '@/app/[locale]/(panel)/crm/actions';

export function SourceRowActions({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();

  function handleRun() {
    start(async () => {
      const r = await runSourceAction(id);
      if (r.ok) {
        toast.success('Запущено в очередь');
        router.refresh();
      } else {
        toast.error(`Ошибка: ${r.code}`);
      }
    });
  }

  function handleToggle() {
    start(async () => {
      const r = await updateSourceAction(id, { enabled: !enabled });
      if (r.ok) {
        toast.success(enabled ? 'Выключено' : 'Включено');
        router.refresh();
      } else {
        toast.error(`Ошибка: ${r.code}`);
      }
    });
  }

  function handleDelete() {
    start(async () => {
      const r = await deleteSourceAction(id);
      if (r.ok) {
        toast.success('Удалено');
        router.refresh();
      } else {
        toast.error(`Ошибка: ${r.code}`);
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button size="sm" variant="outline" onClick={handleRun}>
        Запустить
      </Button>
      <Button size="sm" variant="ghost" onClick={handleToggle}>
        {enabled ? 'Откл.' : 'Вкл.'}
      </Button>
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="ghost" className="text-destructive">
            Удалить
          </Button>
        }
        title="Удалить источник?"
        description="Лиды останутся, но связь с источником будет очищена."
        confirmLabel="Удалить"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
