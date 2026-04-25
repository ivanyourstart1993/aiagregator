import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail } from 'lucide-react';

export default async function CheckInboxPage() {
  const t = await getTranslations('auth');
  return (
    <Card>
      <CardHeader>
        <Mail className="h-8 w-8 text-primary" />
        <CardTitle>{t('checkInboxTitle')}</CardTitle>
        <CardDescription>{t('checkInboxSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
