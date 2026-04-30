import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { CouponForm } from '@/components/coupons/CouponForm';

export default async function NewCouponPage() {
  const t = await getTranslations('admin.coupons');
  const tCommon = await getTranslations('common');

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/coupons">
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{t('newTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <CouponForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
