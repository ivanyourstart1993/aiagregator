import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { TariffSummary } from '@/lib/server-api';

interface Props {
  tariff: TariffSummary | null;
}

export async function TariffHeader({ tariff }: Props) {
  const t = await getTranslations('pricing');
  if (!tariff) return null;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('yourTariff')}
          </p>
          <p className="text-lg font-semibold">{tariff.name}</p>
        </div>
        <Badge variant={tariff.isDefault ? 'secondary' : 'default'}>
          {tariff.isDefault ? t('tariffDefault') : t('tariffPersonal')}
        </Badge>
      </CardContent>
    </Card>
  );
}
