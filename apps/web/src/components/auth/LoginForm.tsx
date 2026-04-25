'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signIn } from 'next-auth/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link, useRouter } from '@/i18n/navigation';
import { GoogleButton } from './GoogleButton';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

interface LoginFormProps {
  callbackUrl?: string;
}

export function LoginForm({ callbackUrl = '/dashboard' }: LoginFormProps) {
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
      const res = await signIn('credentials', {
        email: values.email,
        password: values.password,
        redirect: false,
      });
      if (!res) {
        toast.error(t('errorGeneric'));
        return;
      }
      if (res.error) {
        // res.error is the stable code we throw from authorize()
        const code = res.error;
        if (code === 'email_not_verified' || code === 'EMAIL_NOT_VERIFIED') {
          setServerError(t('errorEmailNotVerified'));
          return;
        }
        if (code.toLowerCase().includes('invalid')) {
          setServerError(t('errorInvalidCredentials'));
          return;
        }
        setServerError(t('errorGeneric'));
        return;
      }
      toast.success(tCommon('success'));
      router.push(callbackUrl);
      router.refresh();
    });
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
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t('password')}</Label>
          <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
            {t('forgotPassword')}
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
          aria-invalid={!!errors.password}
        />
      </div>
      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? tCommon('loading') : t('loginButton')}
      </Button>
      <div className="relative my-2 text-center text-xs text-muted-foreground">
        <span className="bg-background px-2">{t('or')}</span>
      </div>
      <GoogleButton callbackUrl={callbackUrl} />
      <p className="text-center text-sm text-muted-foreground">
        {t('noAccount')}{' '}
        <Link href="/signup" className="font-medium text-foreground hover:underline">
          {t('signupLink')}
        </Link>
      </p>
    </form>
  );
}
