'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteFileNowAction } from '@/app/[locale]/(admin)/admin/files/actions';

export function FileDeleteButton({ id }: { id: string }) {
  const t = useTranslations('admin.files');
  const [pending, startTransition] = useTransition();
  function handle() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const res = await deleteFileNowAction(id);
      if (res.ok) toast.success(t('deleted'));
      else toast.error(t('deleteFailed'));
    });
  }
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={handle}>
      <Trash2 className="h-4 w-4" />
      {t('deleteNow')}
    </Button>
  );
}
