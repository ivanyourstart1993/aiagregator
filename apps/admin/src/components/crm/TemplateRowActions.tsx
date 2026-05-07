'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  deleteTemplateAction,
  updateTemplateAction,
} from '@/app/[locale]/(panel)/crm/actions';

export function TemplateRowActions({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();

  function toggle() {
    start(async () => {
      const r = await updateTemplateAction(id, { enabled: !enabled });
      if (r.ok) {
        toast.success(enabled ? 'Выключено' : 'Включено');
        router.refresh();
      } else {
        toast.error(`Ошибка: ${r.code}`);
      }
    });
  }

  function remove() {
    start(async () => {
      const r = await deleteTemplateAction(id);
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
      <Button size="sm" variant="ghost" onClick={toggle}>
        {enabled ? 'Откл.' : 'Вкл.'}
      </Button>
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="ghost" className="text-destructive">
            Удалить
          </Button>
        }
        title="Удалить шаблон?"
        confirmLabel="Удалить"
        variant="destructive"
        onConfirm={remove}
      />
    </div>
  );
}
