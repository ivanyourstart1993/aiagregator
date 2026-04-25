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
import type { CatalogStatus, ModelAdminView } from '@/lib/server-api';
import {
  createModelAction,
  updateModelAction,
} from '@/app/[locale]/(admin)/admin/catalog/actions';

const STATUSES: CatalogStatus[] = ['ACTIVE', 'DISABLED', 'DEPRECATED'];

interface Props {
  mode: 'create' | 'edit';
  providerId?: string;
  model?: ModelAdminView;
}

export function ModelForm({ mode, providerId, model }: Props) {
  const t = useTranslations('admin.catalog');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [code, setCode] = useState(model?.code ?? '');
  const [publicName, setPublicName] = useState(model?.publicName ?? '');
  const [description, setDescription] = useState(model?.description ?? '');
  const [sortOrder, setSortOrder] = useState(String(model?.sortOrder ?? 0));
  const [status, setStatus] = useState<CatalogStatus>(model?.status ?? 'ACTIVE');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sortOrderN = Number.parseInt(sortOrder, 10);
    const body = {
      publicName: publicName.trim(),
      description: description?.trim() || null,
      sortOrder: Number.isFinite(sortOrderN) ? sortOrderN : 0,
      status,
    };

    startTransition(async () => {
      if (mode === 'create') {
        if (!providerId) return;
        const res = await createModelAction(providerId, { ...body, code: code.trim() });
        if (!res.ok) {
          toast.error(t('saveFailed'));
          return;
        }
        toast.success(t('saved'));
        router.push(`/admin/catalog/models/${res.data!.id}`);
      } else {
        const res = await updateModelAction(model!.id, body);
        if (!res.ok) toast.error(t('saveFailed'));
        else toast.success(t('saved'));
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t('modelCode')}>
        <Input
          value={code}
          disabled={mode === 'edit'}
          onChange={(e) => setCode(e.target.value)}
          placeholder="banana-1"
          className="font-mono"
        />
      </Field>
      <Field label={t('modelPublicName')}>
        <Input
          value={publicName}
          onChange={(e) => setPublicName(e.target.value)}
          placeholder="Banana 1"
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
