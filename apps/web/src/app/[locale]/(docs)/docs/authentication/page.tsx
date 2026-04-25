import { getTranslations } from 'next-intl/server';

export default async function AuthenticationPage() {
  const t = await getTranslations('docs');
  return (
    <article className="prose max-w-none space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('authenticationTitle')}</h1>
      <p className="text-muted-foreground">{t('authenticationBody')}</p>

      <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
        <code>{`Authorization: Bearer sk_live_<prefix>_<secret>`}</code>
      </pre>

      <p className="text-sm text-muted-foreground">{t('authBodyExtra')}</p>
    </article>
  );
}
