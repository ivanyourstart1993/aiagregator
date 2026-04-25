import { getTranslations } from 'next-intl/server';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { verifyEmail } from './actions';

interface VerifyPageProps {
  searchParams: { token?: string };
}

export default async function VerifyEmailPage({ searchParams }: VerifyPageProps) {
  const t = await getTranslations('auth');
  const token = searchParams.token;

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <XCircle className="h-8 w-8 text-destructive" />
          <CardTitle>{t('verifyEmailTitle')}</CardTitle>
          <CardDescription>{t('verifyEmailMissingToken')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const result = await verifyEmail(token);

  return (
    <Card>
      <CardHeader>
        {result.ok ? (
          <CheckCircle2 className="h-8 w-8 text-primary" />
        ) : (
          <XCircle className="h-8 w-8 text-destructive" />
        )}
        <CardTitle>{t('verifyEmailTitle')}</CardTitle>
        <CardDescription>
          {result.ok ? t('verifyEmailSuccess') : t('verifyEmailError')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {result.ok ? (
          <Button asChild className="w-full">
            <Link href="/login">{t('loginButton')}</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
