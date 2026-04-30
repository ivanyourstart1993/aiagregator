'use client';

import { useState, useTransition } from 'react';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  callbackUrl: string;
}

export function LoginForm({ callbackUrl }: Props) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);

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
          // CredentialsSignin without our specific code wraps any throw
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
  );
}
