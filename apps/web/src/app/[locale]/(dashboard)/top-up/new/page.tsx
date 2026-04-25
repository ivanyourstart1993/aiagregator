import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { NewTopUpForm } from '@/components/dashboard/billing/NewTopUpForm';

export default async function NewTopUpPage() {
  const t = await getTranslations('topup');
  const tCommon = await getTranslations('common');

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/top-up">
            <ArrowLeft className="h-4 w-4" />
            {tCommon('back')}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{t('newTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('newSubtitle')}</p>
      </header>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-lg">{t('newTitle')}</CardTitle>
          <CardDescription>{t('newSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <NewTopUpForm />
        </CardContent>
      </Card>
    </div>
  );
}
