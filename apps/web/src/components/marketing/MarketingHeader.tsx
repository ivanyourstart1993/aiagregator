import { Sparkles } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/dashboard/LocaleSwitcher';

export async function MarketingHeader() {
  const t = await getTranslations('marketing.nav');
  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/40">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-info/15 text-info">
            <Sparkles className="h-4 w-4" />
          </span>
          AI Aggregator
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <Link href="/#features">{t('features')}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <Link href="/#providers">{t('providers')}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <Link href="/#pricing">{t('pricing')}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <Link href="/docs/getting-started">{t('docs')}</Link>
          </Button>
        </nav>

        <div className="flex items-center gap-1">
          <LocaleSwitcher />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/login">{t('signIn')}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">{t('signUp')}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
