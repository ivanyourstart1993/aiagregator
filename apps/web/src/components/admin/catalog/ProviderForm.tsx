'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CatalogStatus, ProviderAdminView } from '@/lib/server-api';
import {
  createProviderAction,
  updateProviderAction,
} from '@/app/[locale]/(admin)/admin/catalog/actions';

const STATUSES: CatalogStatus[] = ['ACTIVE', 'DISABLED', 'DEPRECATED'];

interface Props {
  mode: 'create' | 'edit';
  provider?: ProviderAdminView;
}

export function ProviderForm({ mode, provider }: Props) {
  const t = useTranslations('admin.catalog');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [code, setCode] = useState(provider?.code ?? '');
  const [publicName, setPublicName] = useState(provider?.publicName ?? '');
  const [description, setDescription] = useState(provider?.description ?? '');
  const [sortOrder, setSortOrder] = useState(String(provider?.sortOrder ?? 0));
  const [status, setStatus] = useState<CatalogStatus>(provider?.status ?? 'ACTIVE');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sortOrderN = Number.parseInt(sortOrder, 10);
    const body = {
      publicName: publicName.trim(),
      description: description.trim() || null,
      sortOrder: Number.isFinite(sortOrderN) ? sortOrderN : 0,
      status,
    };

    startTransition(async () => {
      if (mode === 'create') {
        const res = await createProviderAction({ ...body, code: code.trim() });
        if (!res.ok) {
          toast.error(t('saveFailed'));
          return;
        }
        toast.success(t('saved'));
        router.push(`/admin/catalog/providers/${res.data!.id}`);
      } else {
        const res = await updateProviderAction(provider!.id, body);
        if (!res.ok) toast.error(t('saveFailed'));
        else toast.success(t('saved'));
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t('providerCode')}>
        <Input
          value={code}
          disabled={mode === 'edit'}
          onChange={(e) => setCode(e.target.value)}
          placeholder="google_banana"
          className="font-mono"
        />
      </Field>
      <Field label={t('providerPublicName')}>
        <Input
          value={publicName}
          onChange={(e) => setPublicName(e.target.value)}
          placeholder="Google Banana"
        />
      </Field>
      <Field label={t('description')}>
        <Textarea
          rows={3}
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('sortOrder')}>
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </Field>
        <Field label={t('status')}>
          <Select value={status} onValueChange={(v) => setStatus(v as CatalogStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`statusValue.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          {tCommon('cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {mode === 'create' ? tCommon('create') : tCommon('save')}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
