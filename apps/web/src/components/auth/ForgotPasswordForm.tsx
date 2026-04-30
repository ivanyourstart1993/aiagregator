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
import { Link } from '@/i18n/navigation';
import { requestPasswordReset } from '@/app/[locale]/(auth)/forgot-password/actions';

const schema = z.object({
  email: z.string().email(),
});
type FormValues = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const res = await requestPasswordReset(values);
      if (!res.ok) {
        toast.error(t('errorGeneric'));
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-foreground">{t('forgotPasswordSent')}</p>
        <p className="text-muted-foreground">{t('forgotPasswordSentHint')}</p>
        <Link href="/login" className="inline-block text-sm font-medium hover:underline">
          {t('loginLink')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          {...register('email')}
          aria-invalid={!!errors.email}
        />
        {errors.email ? (
          <p className="text-xs text-destructive">{t('emailInvalid')}</p>
        ) : null}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? tCommon('loading') : t('forgotPasswordSubmit')}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground hover:underline">
          {t('loginLink')}
        </Link>
      </p>
    </form>
  );
}
