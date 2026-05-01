import { getTranslations } from 'next-intl/server';

export default async function GettingStartedPage() {
  const t = await getTranslations('docs');
  return (
    <article className="prose max-w-none space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('gettingStartedTitle')}</h1>
      <p className="text-muted-foreground">{t('gettingStartedBody')}</p>

      <ol className="ml-4 list-decimal space-y-3 text-sm">
        <li>{t('gsStep1')}</li>
        <li>{t('gsStep2')}</li>
        <li>{t('gsStep3')}</li>
        <li>{t('gsStep4')}</li>
        <li>{t('gsStep5')}</li>
      </ol>

      <h2 className="mt-8 text-xl font-semibold">{t('gsEstimateTitle')}</h2>
      <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
        <code>{`curl -X POST https://api.aigenway.com/v1/estimate \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "google_banana",
    "model": "gemini-3.1-flash-image-preview",
    "method": "text_to_image",
    "params": { "prompt": "a cat" }
  }'`}</code>
      </pre>

      <h2 className="mt-8 text-xl font-semibold">{t('gsGenerationsTitle')}</h2>
      <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
        <code>{`curl -X POST https://api.aigenway.com/v1/generations \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "google_banana",
    "model": "gemini-3.1-flash-image-preview",
    "method": "text_to_image",
    "params": { "prompt": "a cat" }
  }'`}</code>
      </pre>
    </article>
  );
}
