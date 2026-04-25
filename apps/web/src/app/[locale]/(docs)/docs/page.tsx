import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export default async function DocsIndexPage() {
  const t = await getTranslations('docs');
  return (
    <article className="prose max-w-none space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('introTitle')}</h1>
      <p className="text-muted-foreground">{t('introBody')}</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/docs/methods">{t('ctaStart')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/docs/getting-started">{t('gettingStarted')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/docs/authentication">{t('authentication')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/docs/errors">{t('errors')}</Link>
        </Button>
      </div>
    </article>
  );
}
