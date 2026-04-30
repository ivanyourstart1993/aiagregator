'use client';

import { useEffect, useState, useTransition } from 'react';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GoogleButton } from './GoogleButton';

interface Props {
  callbackUrl: string;
}

export function LoginForm({ callbackUrl }: Props) {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // Surface forbidden / oauth errors from the signIn redirect.
  useEffect(() => {
    const e = searchParams.get('error');
    if (e === 'forbidden') setErr(t('errorForbidden'));
    else if (e === 'oauth') setErr(t('errorGeneric'));
  }, [searchParams, t]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const res = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        const e = String(res.error);
        if (e === 'forbidden' || e === 'CredentialsSignin') {
          setErr(t('errorInvalid'));
        } else if (e.includes('forbidden')) {
          setErr(t('errorForbidden'));
        } else {
          setErr(t('errorGeneric'));
        }
        return;
      }
      const noLocale = callbackUrl.replace(/^\/(en|ru)(?=\/|$)/, '') || '/';
      router.push(noLocale);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t('email')}</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t('password')}</Label>
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {err ? <p className="text-xs text-destructive">{err}</p> : null}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? t('signingIn') : t('signIn')}
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border/60" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">{t('or')}</span>
        </div>
      </div>

      <GoogleButton callbackUrl={callbackUrl} />
    </div>
  );
}
