'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link, useRouter } from '@/i18n/navigation';
import { GoogleButton } from './GoogleButton';
import { registerUser } from '@/app/[locale]/(auth)/signup/actions';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});
type FormValues = z.infer<typeof schema>;

export function SignupForm() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const locale = useLocale();
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
      const result = await registerUser({ ...values, locale });
      if (!result.ok) {
        const msg = result.code === 'email_not_verified' ? t('errorEmailNotVerified') : t('signupFailed');
        setServerError(msg);
        toast.error(msg);
        return;
      }
      toast.success(tCommon('success'));
      router.push('/check-inbox');
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{t('name')}</Label>
        <Input id="name" type="text" autoComplete="name" {...register('name')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        {errors.email ? <p className="text-xs text-destructive">{t('emailInvalid')}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t('password')}</Label>
        <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
        {errors.password ? <p className="text-xs text-destructive">{t('passwordMin')}</p> : null}
      </div>
      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? tCommon('loading') : t('signupButton')}
      </Button>
      <div className="relative my-2 text-center text-xs text-muted-foreground">
        <span className="bg-background px-2">{t('or')}</span>
      </div>
      <GoogleButton />
      <p className="text-center text-sm text-muted-foreground">
        {t('hasAccount')}{' '}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          {t('loginLink')}
        </Link>
      </p>
    </form>
  );
}

