import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ExportForm } from '@/components/dashboard/exports/ExportForm';

export default async function NewExportPage() {
  const t = await getTranslations('exports');
  const tCommon = await getTranslations('common');
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/exports">
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{t('newTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ExportForm />
        </CardContent>
      </Card>
    </div>
  );
}
