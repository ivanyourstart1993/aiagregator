import { getTranslations } from 'next-intl/server';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNanoUSDWithSign } from '@/lib/money';
import type { CouponRedemptionView } from '@/lib/server-api';
import { CouponTypeBadge } from './CouponTypeBadge';

interface Props {
  items: CouponRedemptionView[];
}

function contextKey(r: CouponRedemptionView): 'standalone' | 'request' | 'topup' {
  if (r.depositId) return 'topup';
  if (r.apiRequestId) return 'request';
  return 'standalone';
}

export async function RedemptionsTable({ items }: Props) {
  const t = await getTranslations('admin.coupons');
  const tCtx = await getTranslations('coupons.context');

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card py-10 text-center text-sm text-muted-foreground">
        {t('noRedemptions')}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tableCoupon')}</TableHead>
            <TableHead>{t('tableType')}</TableHead>
            <TableHead className="text-right">{t('tableAmount')}</TableHead>
            <TableHead>{t('tableContext')}</TableHead>
            <TableHead>{t('tableCreated')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-mono text-xs">{item.couponCode}</TableCell>
              <TableCell>
                <CouponTypeBadge type={item.couponType} />
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatNanoUSDWithSign(item.amountUnits)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {tCtx(contextKey(item))}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(item.createdAt).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
