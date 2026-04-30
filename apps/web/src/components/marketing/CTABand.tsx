import { ArrowRight, BookOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export function CTABand() {
  const t = useTranslations('marketing.cta');
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6 md:py-20">
      <div className="relative overflow-hidden rounded-2xl border border-info/30 bg-gradient-to-br from-info/[0.08] via-card/60 to-card/80 p-8 md:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full"
          style={{
            background:
              'radial-gradient(circle, hsl(217 91% 60% / 0.25), transparent 70%)',
          }}
        />
        <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t('title')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {t('subtitle')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link href="/signup">
                {t('primary')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2">
              <Link href="/docs/getting-started">
                <BookOpen className="h-4 w-4" />
                {t('secondary')}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
