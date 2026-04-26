'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toggleSandboxAction } from '@/app/[locale]/(admin)/admin/users/actions';

interface Props {
  userId: string;
  initialEnabled: boolean;
}

export function SandboxToggle({ userId, initialEnabled }: Props) {
  const t = useTranslations('admin.users.sandbox');
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setEnabled(next);
    startTransition(async () => {
      const res = await toggleSandboxAction(userId, next);
      if (res.ok) toast.success(t('applied'));
      else {
        setEnabled(!next);
        toast.error(t('failed'));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </CardHeader>
      <CardContent>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={enabled} onCheckedChange={toggle} disabled={pending} />
          <span>{enabled ? t('enabled') : t('disabled')}</span>
        </label>
      </CardContent>
    </Card>
  );
}
