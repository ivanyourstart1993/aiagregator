import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from '@/components/auth/LoginForm';

interface LoginPageProps {
  searchParams: { callbackUrl?: string };
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const t = await getTranslations('auth');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('loginTitle')}</CardTitle>
        <CardDescription>{t('loginSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm callbackUrl={searchParams.callbackUrl ?? '/dashboard'} />
      </CardContent>
    </Card>
  );
}
