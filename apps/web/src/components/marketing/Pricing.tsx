import { Check, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Tier {
  key: 'tierFree' | 'tierStandard' | 'tierEnterprise';
  highlight?: boolean;
}

const TIERS: Tier[] = [
  { key: 'tierFree' },
  { key: 'tierStandard', highlight: true },
  { key: 'tierEnterprise' },
];

export function Pricing() {
  const t = useTranslations('marketing.pricing');
  return (
    <section id="pricing" className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6 md:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-info">{t('eyebrow')}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t('subtitle')}
        </p>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {TIERS.map((tier) => (
          <PricingCard key={tier.key} tier={tier} />
        ))}
      </div>
    </section>
  );
}

function PricingCard({ tier }: { tier: Tier }) {
  const t = useTranslations(`marketing.pricing.${tier.key}`);
  const tCommon = useTranslations('marketing.pricing');
  const features = ['feature1', 'feature2', 'feature3', 'feature4'] as const;
  return (
    <article
      className={cn(
        'relative flex flex-col gap-5 rounded-xl border p-6 transition-colors',
        tier.highlight
          ? 'border-info/50 bg-info/[0.04] hover:bg-info/[0.06]'
          : 'border-border/60 bg-card/60 hover:border-border hover:bg-card',
      )}
    >
      {tier.highlight ? (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full border border-info/40 bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-info">
          <Sparkles className="h-3 w-3" />
          {tCommon('popular')}
        </span>
      ) : null}

      <div>
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-semibold">{t('name')}</h3>
          <span className="text-xs text-muted-foreground">{t('badge')}</span>
        </div>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-3xl font-semibold tracking-tight">{t('price')}</span>
          <span className="text-sm text-muted-foreground">{t('priceSuffix')}</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t('description')}</p>
      </div>

      <ul className="space-y-2">
        {features.map((f) => (
          <li key={f} className="flex gap-2 text-sm text-muted-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>{t(f)}</span>
          </li>
        ))}
      </ul>

      <Button
        asChild
        className="mt-auto w-full"
        variant={tier.highlight ? 'default' : 'outline'}
      >
        <Link href={t('ctaHref')}>{t('cta')}</Link>
      </Button>
    </article>
  );
}
