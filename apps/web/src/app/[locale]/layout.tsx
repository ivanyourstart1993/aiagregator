import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Lora } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { routing } from '@/i18n/routing';
import { ApiError, serverApi, type SiteConfig } from '@/lib/server-api';

// Editorial serif headline. Originally tried Fraunces (more "magazine"
// feel) but it ships only Latin + Vietnamese on Google Fonts — build
// fails on `subsets: ['cyrillic']`. Lora has a similar warm-editorial
// register and full Latin + Cyrillic coverage, so localized RU
// headlines render correctly without falling back to a system serif.
const serif = Lora({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-serif',
  display: 'swap',
});

interface LocaleLayoutProps {
  children: ReactNode;
  params: { locale: string };
}

// Stage 1: keep rendering fully dynamic so next-intl APIs and server-side
// session lookups work without opting into static prerender. We can revisit
// once the surface stabilises and we want to enable static rendering for
// marketing routes (would need `setRequestLocale` and split tree).
export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

async function loadSiteConfig(): Promise<SiteConfig> {
  try {
    return await serverApi.getSiteConfig();
  } catch (err) {
    if (!(err instanceof ApiError)) {
      // Don't crash the whole layout if the API is briefly unreachable.
      console.warn('[layout] site config fetch failed', err);
    }
    return { gtm: { containerId: null, enabled: false } };
  }
}

export default async function LocaleLayout({ children, params: { locale } }: LocaleLayoutProps) {
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  const [messages, siteConfig] = await Promise.all([getMessages(), loadSiteConfig()]);
  const gtmId =
    siteConfig.gtm.enabled && siteConfig.gtm.containerId ? siteConfig.gtm.containerId : null;

  return (
    <html
      lang={locale}
      className={`dark ${serif.variable}`}
      style={{ colorScheme: 'dark' }}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        {gtmId ? (
          <>
            <Script id="gtm-init" strategy="afterInteractive">
              {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}
            </Script>
            <noscript>
              <iframe
                src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
                height="0"
                width="0"
                style={{ display: 'none', visibility: 'hidden' }}
              />
            </noscript>
          </>
        ) : null}
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
