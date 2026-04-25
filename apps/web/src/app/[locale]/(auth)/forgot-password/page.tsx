import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('forgotPasswordTitle')}</CardTitle>
        <CardDescription>{t('forgotPasswordComingSoon')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/login" className="text-sm font-medium hover:underline">
          {t('loginLink')}
        </Link>
      </CardContent>
    </Card>
  );
}
