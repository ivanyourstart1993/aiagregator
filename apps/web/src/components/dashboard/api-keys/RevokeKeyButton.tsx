'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { revokeKey } from '@/app/[locale]/(dashboard)/api-keys/actions';

interface RevokeKeyButtonProps {
  id: string;
  disabled?: boolean;
}

export function RevokeKeyButton({ id, disabled }: RevokeKeyButtonProps) {
  const t = useTranslations('apiKeys');
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);

  function handleClick() {
    if (!confirmed) {
      const ok = window.confirm(t('confirmRevoke'));
      if (!ok) return;
      setConfirmed(true);
    }
    startTransition(async () => {
      const res = await revokeKey(id);
      if (!res.ok) {
        toast.error(t('revokeFailed'));
        return;
      }
      toast.success(t('revoked'));
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={handleClick}
      disabled={disabled || pending}
    >
      <Trash2 className="h-4 w-4" />
      <span className="sr-only">{t('revoke')}</span>
    </Button>
  );
}
