'use client';

import { Gift, Lock, Sigma, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminMutationDialog } from './AdminMutationDialog';
import { ReservationsList } from './ReservationsList';
import {
  creditUserAction,
  debitUserAction,
  correctUserAction,
  grantBonusAction,
  reserveForUserAction,
} from '@/app/[locale]/(admin)/admin/users/[userId]/actions';
import { formatNanoToUSD } from '@/lib/money';
import type { WalletDetail } from '@/lib/server-api';

interface Props {
  userId: string;
  wallet: WalletDetail;
}

export function WalletPanel({ userId, wallet }: Props) {
  const t = useTranslations('billing');
  const tPanel = useTranslations('admin.billing.userPanel');

  const items = [
    { key: 'available' as const, icon: Wallet, value: wallet.available },
    { key: 'reserved' as const, icon: Lock, value: wallet.reserved },
    { key: 'total' as const, icon: Sigma, value: wallet.total },
    { key: 'bonus' as const, icon: Gift, value: wallet.bonusAvailable },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.key}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t(item.key)}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tracking-tight">
                  ${formatNanoToUSD(item.value)}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <AdminMutationDialog
          title={tPanel('creditUser')}
          submitLabel={tPanel('creditUser')}
          trigger={<Button variant="default">{tPanel('creditUser')}</Button>}
          onSubmit={(v) => creditUserAction({ userId, ...v })}
        />
        <AdminMutationDialog
          title={tPanel('debitUser')}
          submitLabel={tPanel('debitUser')}
          trigger={<Button variant="destructive">{tPanel('debitUser')}</Button>}
          onSubmit={(v) => debitUserAction({ userId, ...v })}
        />
        <AdminMutationDialog
          title={tPanel('correct')}
          submitLabel={tPanel('correct')}
          trigger={<Button variant="outline">{tPanel('correct')}</Button>}
          onSubmit={(v) => correctUserAction({ userId, ...v })}
        />
        <AdminMutationDialog
          title={tPanel('bonus')}
          submitLabel={tPanel('bonus')}
          trigger={<Button variant="secondary">{tPanel('bonus')}</Button>}
          onSubmit={(v) => grantBonusAction({ userId, ...v })}
        />
        <AdminMutationDialog
          title={tPanel('reserve')}
          submitLabel={tPanel('reserve')}
          trigger={<Button variant="outline">{tPanel('reserve')}</Button>}
          onSubmit={(v) => reserveForUserAction({ userId, ...v })}
        />
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {tPanel('reservationsTitle')}
        </h3>
        <ReservationsList userId={userId} reservations={wallet.reservations ?? []} />
      </section>
    </div>
  );
}
