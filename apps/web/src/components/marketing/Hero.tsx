import { ArrowRight, BookOpen, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { CodePreview } from './CodePreview';

export function Hero() {
  const t = useTranslations('marketing');
  return (
    <section className="relative overflow-hidden">
      {/* Soft warm wash, replaces the cool-blue radial that everyone else
          uses. Sits behind the headline, not behind the whole hero — so
          the page bottom stays calm. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px]"
        style={{
          background:
            'radial-gradient(ellipse 70% 45% at 30% 10%, hsl(16 78% 60% / 0.15), transparent 70%)',
        }}
      />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-16 pt-16 md:grid-cols-12 md:gap-8 md:px-6 md:pb-24 md:pt-20 lg:gap-12">
        <div className="md:col-span-6 lg:col-span-7">
          <Link
            href="/docs/getting-started"
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground"
          >
            <span className="flex h-1.5 w-1.5 rounded-full bg-info" />
            <span>{t('badge')}</span>
            <ArrowRight className="h-3 w-3" />
          </Link>

          {/* Editorial serif headline. The italic accent on the second
              line is the brand's signature contrast — sharp sans on
              line 1, soft serif italic on line 2. */}
          <h1 className="mt-6 font-serif text-5xl font-medium leading-[1.05] tracking-tight text-foreground sm:text-6xl md:text-7xl">
            {t('heroTitleLine1')}{' '}
            <em className="not-italic font-normal italic text-info">
              {t('heroTitleAccent')}
            </em>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t('heroSubtitle')}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link href="/signup">
                <Sparkles className="h-4 w-4" />
                {t('ctaSignup')}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2">
              <Link href="/docs/getting-started">
                <BookOpen className="h-4 w-4" />
                {t('ctaDocs')}
              </Link>
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <HeroStat value="10+" label={t('statProviders')} />
            <HeroStat value="USD" label={t('statCurrency')} />
            <HeroStat value="<200ms" label={t('statLatency')} />
            <HeroStat value="99.9%" label={t('statUptime')} />
          </div>
        </div>

        <div className="md:col-span-6 lg:col-span-5">
          <CodePreview />
        </div>
      </div>
    </section>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-mono font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
