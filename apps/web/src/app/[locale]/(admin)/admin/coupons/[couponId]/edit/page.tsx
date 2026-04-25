import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type CouponView } from '@/lib/server-api';
import { CouponForm } from '@/components/admin/coupons/CouponForm';

interface Props {
  params: Promise<{ couponId: string }>;
}

async function safeGet(id: string): Promise<CouponView | null> {
  try {
    return await serverApi.adminGetCoupon(id);
  } catch (err) {
    if (err instanceof ApiError) return null;
    return null;
  }
}

export default async function EditCouponPage({ params }: Props) {
  const { couponId } = await params;
  const t = await getTranslations('admin.coupons');
  const tCommon = await getTranslations('common');
  const coupon = await safeGet(couponId);
  if (!coupon) notFound();

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
          <CardTitle>{t('editTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <CouponForm mode="edit" coupon={coupon} />
        </CardContent>
      </Card>
    </div>
  );
}
