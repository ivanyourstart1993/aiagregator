'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Edit, Star, Tags, Trash2 } from 'lucide-react';
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
import type { TariffSummary } from '@/lib/server-api';
import {
  deleteTariffAction,
  setDefaultTariffAction,
} from '@/app/[locale]/(admin)/admin/pricing/actions';

interface Props {
  tariffs: TariffSummary[];
}

export function TariffsTable({ tariffs }: Props) {
  const t = useTranslations('admin.pricing.tariffs');
  const tCommon = useTranslations('common');
  const [pending, startTransition] = useTransition();

  if (tariffs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-background py-12 text-center text-sm text-muted-foreground">
        {t('noTariffs')}
      </div>
    );
  }

  function handleSetDefault(id: string) {
    startTransition(async () => {
      const res = await setDefaultTariffAction(id);
      if (res.ok) toast.success(t('setDefaultDone'));
      else toast.error(t('setDefaultFailed'));
    });
  }

  function handleDelete(id: string) {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const res = await deleteTariffAction(id);
      if (res.ok) toast.success(t('deleted'));
      else toast.error(t('deleteFailed'));
    });
  }

  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tableSlug')}</TableHead>
            <TableHead>{t('tableName')}</TableHead>
            <TableHead>{t('tableFlags')}</TableHead>
            <TableHead className="w-[1%] text-right">{t('tableActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tariffs.map((tariff) => (
            <TableRow key={tariff.id}>
              <TableCell className="font-mono text-xs">{tariff.slug}</TableCell>
              <TableCell className="font-medium">{tariff.name}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {tariff.isDefault ? (
                    <Badge variant="secondary">{t('isDefault')}</Badge>
                  ) : null}
                  {tariff.isActive ? (
                    <Badge variant="outline">{t('isActive')}</Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/admin/pricing/tariffs/${tariff.id}/prices`}>
                      <Tags className="h-4 w-4" />
                      {t('managePrices')}
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/admin/pricing/tariffs/${tariff.id}`}>
                      <Edit className="h-4 w-4" />
                      {tCommon('edit')}
                    </Link>
                  </Button>
                  {!tariff.isDefault ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => handleSetDefault(tariff.id)}
                    >
                      <Star className="h-4 w-4" />
                      {t('setDefault')}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending || tariff.isDefault}
                    onClick={() => handleDelete(tariff.id)}
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
