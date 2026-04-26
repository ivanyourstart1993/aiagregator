'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { RotateCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  deleteDlqAction,
  retryDlqAction,
} from '@/app/[locale]/(admin)/admin/dlq/actions';

interface Props {
  queue: 'generation' | 'callback';
  jobId: string;
}

export function DlqActions({ queue, jobId }: Props) {
  const t = useTranslations('admin.dlq');
  const [pending, startTransition] = useTransition();

  function retry() {
    startTransition(async () => {
      const res = await retryDlqAction(queue, jobId);
      if (res.ok) toast.success(t('retried'));
      else toast.error(t('retryFailed'));
    });
  }

  function del() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const res = await deleteDlqAction(queue, jobId);
      if (res.ok) toast.success(t('deleted'));
      else toast.error(t('deleteFailed'));
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" disabled={pending} onClick={retry}>
        <RotateCw className="h-4 w-4" />
        {t('retry')}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={del}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
