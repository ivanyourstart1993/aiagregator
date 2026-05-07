'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  deleteOutreachAccountAction,
  updateOutreachAccountAction,
} from '@/app/[locale]/(panel)/crm/actions';
import { type OutreachAccountStatusValue } from '@/lib/server-api';

const NEXT_STATUS: Record<OutreachAccountStatusValue, OutreachAccountStatusValue> = {
  WARMING: 'ACTIVE',
  ACTIVE: 'PAUSED',
  PAUSED: 'ACTIVE',
  BLOCKED: 'PAUSED',
};

const STATUS_LABEL: Record<OutreachAccountStatusValue, string> = {
  WARMING: '→ Активировать',
  ACTIVE: '⏸ Пауза',
  PAUSED: '▶ Возобновить',
  BLOCKED: '⏸ В паузу',
};

export function OutreachAccountRowActions({
  id,
  status,
}: {
  id: string;
  status: OutreachAccountStatusValue;
}) {
  const router = useRouter();
  const [, start] = useTransition();

  function toggle() {
    start(async () => {
      const r = await updateOutreachAccountAction(id, {
        status: NEXT_STATUS[status],
      });
      if (r.ok) {
        toast.success('Статус обновлён');
        router.refresh();
      } else {
        toast.error(`Ошибка: ${r.code}`);
      }
    });
  }

  function remove() {
    start(async () => {
      const r = await deleteOutreachAccountAction(id);
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
        {STATUS_LABEL[status]}
      </Button>
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="ghost" className="text-destructive">
            Удалить
          </Button>
        }
        title="Удалить outreach-аккаунт?"
        description="Связанные диалоги перестанут получать ответы от этого аккаунта."
        confirmLabel="Удалить"
        variant="destructive"
        onConfirm={remove}
      />
    </div>
  );
}
