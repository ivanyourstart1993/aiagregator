import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type BundleView } from '@/lib/server-api';
import { CouponForm } from '@/components/admin/coupons/CouponForm';

async function safeBundles(): Promise<BundleView[]> {
  try {
    const data = await serverApi.adminListBundles({ active: true, pageSize: 200 });
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function NewCouponPage() {
  const t = await getTranslations('admin.coupons');
  const tCommon = await getTranslations('common');
  const bundles = await safeBundles();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin/coupons">
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{t('newTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <CouponForm mode="create" bundles={bundles} />
        </CardContent>
      </Card>
    </div>
  );
}
