import { Sparkles } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export async function MarketingFooter() {
  const t = await getTranslations('marketing.footer');
  const year = new Date().getFullYear();
  return (
    <footer className="mt-20 border-t border-border/50 bg-background">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 md:grid-cols-4 md:px-6">
        <div className="space-y-3 md:col-span-1">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-info/15 text-info">
              <Sparkles className="h-4 w-4" />
            </span>
            Aigenway
          </Link>
          <p className="text-xs leading-relaxed text-muted-foreground">{t('tagline')}</p>
        </div>

        <FooterColumn title={t('product')}>
          <FooterLink href="/#features">{t('features')}</FooterLink>
          <FooterLink href="/#providers">{t('providers')}</FooterLink>
          <FooterLink href="/#pricing">{t('pricing')}</FooterLink>
          <FooterLink href="/docs/getting-started">{t('docs')}</FooterLink>
        </FooterColumn>

        <FooterColumn title={t('account')}>
          <FooterLink href="/signup">{t('signUp')}</FooterLink>
          <FooterLink href="/login">{t('signIn')}</FooterLink>
          <FooterLink href="/dashboard">{t('dashboard')}</FooterLink>
          <FooterLink href="/support">{t('support')}</FooterLink>
        </FooterColumn>

        <FooterColumn title={t('resources')}>
          <FooterLink href="/docs/getting-started">{t('gettingStarted')}</FooterLink>
          <FooterLink href="/docs/errors">{t('errors')}</FooterLink>
          <FooterLink href="/pricing">{t('pricingPage')}</FooterLink>
        </FooterColumn>
      </div>

      <div className="border-t border-border/40">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row md:px-6">
          <span>© {year} Aigenway</span>
          <span>{t('madeWith')}</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">{title}</h3>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {children}
      </Link>
    </li>
  );
}
