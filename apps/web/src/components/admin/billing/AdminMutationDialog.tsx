'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AdminMutationResult } from '@/app/[locale]/(admin)/admin/users/[userId]/actions';

const schema = z.object({
  amountUsd: z.number().positive(),
  reason: z.string().min(1).max(500),
  idempotencyKey: z.string().min(1).max(255),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  submitLabel?: string;
  defaultAmount?: number;
  onSubmit: (values: { amountUsd: number; reason: string; idempotencyKey: string }) => Promise<AdminMutationResult>;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random.
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function AdminMutationDialog({
  trigger,
  title,
  description,
  submitLabel,
  defaultAmount,
  onSubmit,
}: Props) {
  const t = useTranslations('admin.billing.userPanel');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const reasonId = useId();
  const idempotencyId = useId();
  const amountId = useId();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amountUsd: defaultAmount ?? 1,
      reason: '',
      idempotencyKey: newIdempotencyKey(),
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        amountUsd: defaultAmount ?? 1,
        reason: '',
        idempotencyKey: newIdempotencyKey(),
      });
    }
  }, [open, reset, defaultAmount]);

  function submit(values: FormValues) {
    startTransition(async () => {
      const res = await onSubmit({
        amountUsd: values.amountUsd,
        reason: values.reason.trim(),
        idempotencyKey: values.idempotencyKey,
      });
      if (!res.ok) {
        toast.error(t('actionFailed'));
        return;
      }
      toast.success(t('actionSuccess'));
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={amountId}>{t('amount')}</Label>
            <Input
              id={amountId}
              type="number"
              step="0.01"
              min="0"
              {...register('amountUsd', { valueAsNumber: true })}
            />
            {errors.amountUsd ? (
              <p className="text-xs text-destructive">{tCommon('error')}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={reasonId}>{t('reason')}</Label>
            <Textarea
              id={reasonId}
              rows={3}
              placeholder={t('reasonPlaceholder')}
              {...register('reason')}
            />
            {errors.reason ? (
              <p className="text-xs text-destructive">{tCommon('error')}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={idempotencyId}>{t('idempotencyKey')}</Label>
            <Input id={idempotencyId} {...register('idempotencyKey')} />
            <p className="text-xs text-muted-foreground">{t('idempotencyKeyHint')}</p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? tCommon('loading') : submitLabel ?? tCommon('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
