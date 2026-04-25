'use client';

import { useTranslations } from 'next-intl';
import { formatNanoUSDWithSign } from '@/lib/money';
import type { EffectivePriceView } from '@/lib/server-api';

interface Props {
  price: EffectivePriceView;
}

function tryFormat(units: string | null | undefined): string | null {
  if (units == null) return null;
  try {
    return formatNanoUSDWithSign(units, 6);
  } catch {
    return null;
  }
}

export function PriceComponentsCell({ price }: Props) {
  const t = useTranslations('pricing.components');
  const c = price.components;
  const items: Array<{ label: string; value: string }> = [];

  switch (price.unit) {
    case 'PER_REQUEST': {
      const v = tryFormat(c.basePriceUnits);
      if (v) items.push({ label: t('base'), value: v });
      break;
    }
    case 'PER_TOKEN_INPUT':
    case 'PER_TOKEN_OUTPUT': {
      const inV = tryFormat(c.inputPerTokenUnits);
      const outV = tryFormat(c.outputPerTokenUnits);
      if (inV) items.push({ label: t('input'), value: inV });
      if (outV) items.push({ label: t('output'), value: outV });
      break;
    }
    case 'PER_SECOND': {
      const v = tryFormat(c.perSecondUnits);
      if (v) items.push({ label: t('perSecond'), value: v });
      break;
    }
    case 'PER_IMAGE': {
      const v = tryFormat(c.perImageUnits);
      if (v) items.push({ label: t('perImage'), value: v });
      break;
    }
  }

  // Fallbacks when unit doesn't match a populated component
  if (items.length === 0) {
    const v = tryFormat(c.basePriceUnits);
    if (v) items.push({ label: t('base'), value: v });
  }

  if (items.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex flex-col gap-0.5 text-sm">
      {items.map((it) => (
        <div key={it.label} className="flex items-baseline justify-between gap-2 tabular-nums">
          <span className="text-xs text-muted-foreground">{it.label}</span>
          <span className="font-medium">{it.value}</span>
        </div>
      ))}
    </div>
  );
}
