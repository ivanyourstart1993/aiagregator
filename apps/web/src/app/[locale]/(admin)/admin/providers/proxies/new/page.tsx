import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ProxyForm } from '@/components/admin/providers/ProxyForm';

export default async function NewProxyPage() {
  const t = await getTranslations('admin.providers.proxies');
  const tCommon = await getTranslations('common');
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin/providers/proxies">
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{t('newTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProxyForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
