import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Lora } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { routing } from '@/i18n/routing';

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

export default async function LocaleLayout({ children, params: { locale } }: LocaleLayoutProps) {
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`dark ${serif.variable}`}
      style={{ colorScheme: 'dark' }}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
