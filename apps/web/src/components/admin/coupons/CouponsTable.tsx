'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Edit, Eye, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Link } from '@/i18n/navigation';
import { formatNanoUSDWithSign } from '@/lib/money';
import type { CouponType, CouponView } from '@/lib/server-api';
import { CouponStatusBadge } from './CouponStatusBadge';
import { deleteCouponAction } from '@/app/[locale]/(admin)/admin/coupons/actions';

interface Props {
  coupons: CouponView[];
}

function formatValue(c: CouponView): string {
  if (c.type === 'DISCOUNT_METHOD_PERCENT' || c.type === 'DISCOUNT_TOPUP') {
    // value is basis points
    const bps = Number(c.value);
    if (!Number.isFinite(bps)) return c.value;
    return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
  }
  return formatNanoUSDWithSign(c.value);
}

function formatUses(c: CouponView): string {
  const used = c.usesCount ?? 0;
  if (c.maxUses == null) return `${used} / ∞`;
  return `${used} / ${c.maxUses}`;
}

export function CouponsTable({ coupons }: Props) {
  const t = useTranslations('admin.coupons');
  const tForm = useTranslations('admin.coupons.form');
  const tType = useTranslations('admin.coupons.type');
  const tCommon = useTranslations('common');
  const [pending, startTransition] = useTransition();

  if (coupons.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-background py-12 text-center text-sm text-muted-foreground">
        {t('noCoupons')}
      </div>
    );
  }

  function handleDelete(id: string) {
    if (!confirm(tForm('confirmDelete'))) return;
    startTransition(async () => {
      const res = await deleteCouponAction(id);
      if (res.ok) toast.success(tForm('deleted'));
      else toast.error(tForm('deleteFailed'));
    });
  }

  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tableCode')}</TableHead>
            <TableHead>{t('tableType')}</TableHead>
            <TableHead>{t('tableValue')}</TableHead>
            <TableHead>{t('tableStatus')}</TableHead>
            <TableHead>{t('tableValidTo')}</TableHead>
            <TableHead>{t('tableUses')}</TableHead>
            <TableHead>{t('tablePerUser')}</TableHead>
            <TableHead className="w-[1%] text-right">{t('tableActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {coupons.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-mono text-xs">{c.code}</TableCell>
              <TableCell className="text-sm">{tType(c.type as CouponType)}</TableCell>
              <TableCell className="font-medium">{formatValue(c)}</TableCell>
              <TableCell>
                <CouponStatusBadge status={c.status} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {c.validTo ? new Date(c.validTo).toLocaleDateString() : '—'}
              </TableCell>
              <TableCell className="text-sm">{formatUses(c)}</TableCell>
              <TableCell className="text-sm">{c.maxUsesPerUser}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/admin/coupons/${c.id}/redemptions`}>
                      <Eye className="h-4 w-4" />
                      {t('viewRedemptions')}
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/admin/coupons/${c.id}/edit`}>
                      <Edit className="h-4 w-4" />
                      {tCommon('edit')}
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => handleDelete(c.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
