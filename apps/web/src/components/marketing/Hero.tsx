import { ArrowRight, BookOpen, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { CodePreview } from './CodePreview';

export function Hero() {
  const t = useTranslations('marketing');
  return (
    <section className="relative overflow-hidden">
      {/* Subtle radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px]"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 0%, hsl(217 91% 60% / 0.18), transparent 70%)',
        }}
      />
      {/* Subtle grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage:
            'radial-gradient(ellipse 60% 50% at 50% 0%, black 40%, transparent 80%)',
        }}
      />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-16 pt-16 md:grid-cols-12 md:gap-8 md:px-6 md:pb-24 md:pt-20 lg:gap-12">
        <div className="md:col-span-6 lg:col-span-7">
          <Link
            href="/docs/getting-started"
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground"
          >
            <span className="flex h-1.5 w-1.5 rounded-full bg-success" />
            <span>{t('badge')}</span>
            <ArrowRight className="h-3 w-3" />
          </Link>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            {t('heroTitleLine1')}{' '}
            <span className="bg-gradient-to-r from-info via-info to-foreground bg-clip-text text-transparent">
              {t('heroTitleAccent')}
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
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

          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
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
