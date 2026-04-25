import { Gift, Lock, Sigma, Wallet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNanoToUSD } from '@/lib/money';
import type { BalanceView } from '@/lib/server-api';

interface Props {
  balance: BalanceView;
}

export async function BalanceCards({ balance }: Props) {
  const t = await getTranslations('billing');
  const items = [
    { key: 'available', icon: Wallet, value: balance.available, hint: 'availableHint' as const },
    { key: 'reserved', icon: Lock, value: balance.reserved, hint: 'reservedHint' as const },
    { key: 'total', icon: Sigma, value: balance.total, hint: 'totalHint' as const },
    { key: 'bonus', icon: Gift, value: balance.bonusAvailable, hint: 'bonusHint' as const },
  ] as const;

  return (
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
              <p className="mt-1 text-xs text-muted-foreground">{t(item.hint)}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
