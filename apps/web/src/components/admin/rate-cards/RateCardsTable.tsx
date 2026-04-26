'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Edit, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { formatNanoToUSD } from '@/lib/money';
import type { RateCardView } from '@/lib/server-api';
import { deleteRateCardAction } from '@/app/[locale]/(admin)/admin/rate-cards/actions';

interface Props {
  items: RateCardView[];
}

export function RateCardsTable({ items }: Props) {
  const t = useTranslations('admin.rateCards');
  const tCommon = useTranslations('common');
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-background py-12 text-center text-sm text-muted-foreground">
        {t('noItems')}
      </div>
    );
  }

  function handleDelete(id: string) {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const res = await deleteRateCardAction(id);
      if (res.ok) toast.success(t('deleted'));
      else toast.error(t('deleteFailed'));
    });
  }

  function priceDisplay(c: RateCardView): string {
    if (c.pricePerSecond) return `${formatNanoToUSD(c.pricePerSecond, 6)}/s`;
    if (c.pricePerImage) return `${formatNanoToUSD(c.pricePerImage, 6)}/img`;
    if (c.pricePerTokenInput) return `${formatNanoToUSD(c.pricePerTokenInput, 8)}/in tok`;
    if (c.pricePerTokenOutput) return `${formatNanoToUSD(c.pricePerTokenOutput, 8)}/out tok`;
    return '—';
  }

  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tableProvider')}</TableHead>
            <TableHead>{t('tableModelMethod')}</TableHead>
            <TableHead>{t('tablePriceType')}</TableHead>
            <TableHead>{t('tablePrice')}</TableHead>
            <TableHead>{t('tableCost')}</TableHead>
            <TableHead>{t('tableActive')}</TableHead>
            <TableHead className="w-[1%] text-right">{t('tableActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-mono text-xs">
                {c.providerCode ?? c.providerId}
              </TableCell>
              <TableCell className="text-xs">
                {(c.modelCode ?? '*') + ' / ' + (c.methodCode ?? '*')}
              </TableCell>
              <TableCell className="text-xs">{c.priceType}</TableCell>
              <TableCell className="font-mono text-xs">{priceDisplay(c)}</TableCell>
              <TableCell className="font-mono text-xs">
                {c.providerCostUnits ? formatNanoToUSD(c.providerCostUnits, 6) : '—'}
              </TableCell>
              <TableCell>
                {c.isActive ? (
                  <Badge variant="default">●</Badge>
                ) : (
                  <Badge variant="secondary">○</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/admin/rate-cards/${c.id}`}>
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
