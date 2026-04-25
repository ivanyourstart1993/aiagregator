'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  createTariffAction,
  updateTariffAction,
} from '@/app/[locale]/(admin)/admin/pricing/actions';
import type { TariffSummary } from '@/lib/server-api';

const createSchema = z.object({
  slug: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/i),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  isActive: z.boolean(),
});

type CreateValues = z.infer<typeof createSchema>;
type UpdateValues = z.infer<typeof updateSchema>;

interface Props {
  mode: 'create' | 'edit';
  tariff?: TariffSummary;
}

export function TariffForm({ mode, tariff }: Props) {
  const t = useTranslations('admin.pricing.tariffs');
  const tCommon = useTranslations('common');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (mode === 'create') {
    return <CreateForm onPending={pending} startTransition={startTransition} router={router} t={t} tCommon={tCommon} />;
  }
  return (
    <EditForm
      tariff={tariff!}
      pending={pending}
      startTransition={startTransition}
      t={t}
      tCommon={tCommon}
    />
  );
}

function CreateForm({
  onPending,
  startTransition,
  router,
  t,
  tCommon,
}: {
  onPending: boolean;
  startTransition: React.TransitionStartFunction;
  router: ReturnType<typeof useRouter>;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateValues>({ resolver: zodResolver(createSchema) });

  function submit(values: CreateValues) {
    startTransition(async () => {
      const res = await createTariffAction(values);
      if (!res.ok) {
        toast.error(t('saveFailed'));
        return;
      }
      toast.success(t('saved'));
      router.push(`/admin/pricing/tariffs/${res.data!.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <Field label={t('slug')} error={errors.slug?.message}>
        <Input placeholder={t('slugPlaceholder')} {...register('slug')} />
      </Field>
      <Field label={t('name')} error={errors.name?.message}>
        <Input placeholder={t('namePlaceholder')} {...register('name')} />
      </Field>
      <Field label={t('description')} error={errors.description?.message}>
        <Textarea
          rows={3}
          placeholder={t('descriptionPlaceholder')}
          {...register('description')}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={onPending}>
          {tCommon('cancel')}
        </Button>
        <Button type="submit" disabled={onPending}>
          {tCommon('create')}
        </Button>
      </div>
    </form>
  );
}

function EditForm({
  tariff,
  pending,
  startTransition,
  t,
  tCommon,
}: {
  tariff: TariffSummary;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UpdateValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      name: tariff.name,
      description: tariff.description ?? '',
      isActive: tariff.isActive,
    },
  });
  const isActive = watch('isActive');

  function submit(values: UpdateValues) {
    startTransition(async () => {
      const res = await updateTariffAction(tariff.id, values);
      if (!res.ok) toast.error(t('saveFailed'));
      else toast.success(t('saved'));
    });
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <Field label={t('slug')}>
        <Input value={tariff.slug} disabled />
      </Field>
      <Field label={t('name')} error={errors.name?.message}>
        <Input {...register('name')} />
      </Field>
      <Field label={t('description')} error={errors.description?.message}>
        <Textarea rows={3} {...register('description')} />
      </Field>
      <div className="flex items-center gap-3">
        <Switch
          checked={isActive}
          onCheckedChange={(v) => setValue('isActive', v, { shouldDirty: true })}
          id="tariff-active"
        />
        <Label htmlFor="tariff-active">{t('isActive')}</Label>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {tCommon('save')}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
