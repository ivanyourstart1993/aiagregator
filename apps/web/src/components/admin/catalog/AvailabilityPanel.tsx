'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AvailabilityView } from '@/lib/server-api';
import { setMethodAvailabilityAction } from '@/app/[locale]/(admin)/admin/catalog/actions';

interface Props {
  methodId: string;
  initial?: AvailabilityView;
}

export function AvailabilityPanel({ methodId, initial }: Props) {
  const t = useTranslations('admin.catalog');
  const tCommon = useTranslations('common');
  const [scope, setScope] = useState<'ALL_USERS' | 'WHITELIST'>(
    initial?.scope ?? 'ALL_USERS',
  );
  const [userIdsRaw, setUserIdsRaw] = useState(
    (initial?.userIds ?? []).join('\n'),
  );
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const userIds =
      scope === 'WHITELIST'
        ? userIdsRaw
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    startTransition(async () => {
      const res = await setMethodAvailabilityAction(methodId, { scope, userIds });
      if (!res.ok) toast.error(t('saveFailed'));
      else toast.success(t('saved'));
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label>{t('availabilityScope')}</Label>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              value="ALL_USERS"
              checked={scope === 'ALL_USERS'}
              onChange={() => setScope('ALL_USERS')}
            />
            {t('availabilityAll')}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              value="WHITELIST"
              checked={scope === 'WHITELIST'}
              onChange={() => setScope('WHITELIST')}
            />
            {t('availabilityWhitelist')}
          </label>
        </div>
      </div>

      {scope === 'WHITELIST' ? (
        <div className="space-y-2">
          <Label>{t('availabilityUserIds')}</Label>
          <Textarea
            rows={6}
            value={userIdsRaw}
            onChange={(e) => setUserIdsRaw(e.target.value)}
            placeholder={t('availabilityUserIdsPlaceholder')}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            {t('availabilityUserIdsHint')}
          </p>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {tCommon('save')}
        </Button>
      </div>
    </form>
  );
}
