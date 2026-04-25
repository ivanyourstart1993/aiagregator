import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export function Hero() {
  const t = useTranslations('marketing');
  return (
    <section className="mx-auto max-w-4xl px-6 py-24 text-center">
      <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">{t('heroTitle')}</h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">{t('heroSubtitle')}</p>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/signup">{t('ctaSignup')}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">{t('ctaLogin')}</Link>
        </Button>
        <Button asChild size="lg" variant="ghost">
          <Link href="/docs/getting-started">{t('ctaDocs')}</Link>
        </Button>
      </div>
    </section>
  );
}
