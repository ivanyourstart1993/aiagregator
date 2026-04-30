'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link, useRouter } from '@/i18n/navigation';
import { resetPasswordAction } from '@/app/[locale]/(auth)/reset-password/actions';

const schema = z
  .object({
    password: z.string().min(8),
    confirm: z.string().min(8),
  })
  .refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'mismatch' });
type FormValues = z.infer<typeof schema>;

interface Props {
  token: string;
}

export function ResetPasswordForm({ token }: Props) {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function onSubmit(values: FormValues) {
    setServerError(null);
    startTransition(async () => {
      const res = await resetPasswordAction({ token, password: values.password });
      if (!res.ok) {
        const msg =
          res.code === 'INVALID_REQUEST' || res.code === 'invalid_request'
            ? t('resetPasswordInvalidToken')
            : t('errorGeneric');
        setServerError(msg);
        toast.error(msg);
        return;
      }
      toast.success(t('resetPasswordSuccess'));
      router.push('/login');
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">{t('newPassword')}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
          aria-invalid={!!errors.password}
        />
        {errors.password ? (
          <p className="text-xs text-destructive">{t('passwordMin')}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">{t('confirmPassword')}</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          {...register('confirm')}
          aria-invalid={!!errors.confirm}
        />
        {errors.confirm ? (
          <p className="text-xs text-destructive">{t('passwordMismatch')}</p>
        ) : null}
      </div>
      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? tCommon('loading') : t('resetPasswordSubmit')}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground hover:underline">
          {t('loginLink')}
        </Link>
      </p>
    </form>
  );
}
