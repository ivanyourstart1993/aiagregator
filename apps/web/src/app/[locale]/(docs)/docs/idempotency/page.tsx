import { getTranslations } from 'next-intl/server';

export default async function IdempotencyPage() {
  const t = await getTranslations('docs');
  return (
    <article className="prose max-w-none space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('idempotencyTitle')}</h1>
      <p className="text-muted-foreground">{t('idempotencyBody')}</p>

      <h2 className="mt-8 text-xl font-semibold">{t('idempotencyHowSection')}</h2>
      <p className="text-sm">{t('idempotencyHowBody')}</p>
      <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
        <code>{`POST /v1/generations
Idempotency-Key: order-42-attempt-1
Content-Type: application/json
Authorization: Bearer sk_live_...

{ "provider": "google_banana",
  "model": "gemini-3.1-flash-image-preview",
  "method": "text_to_image",
  "params": { "prompt": "a cat" } }`}</code>
      </pre>

      <h2 className="mt-8 text-xl font-semibold">{t('idempotencyKeyFormatSection')}</h2>
      <ul className="ml-4 list-disc space-y-1 text-sm">
        <li>{t('idempotencyKeyFormatRegex')}</li>
        <li>{t('idempotencyKeyFormatLength')}</li>
        <li>{t('idempotencyKeyFormatScope')}</li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">{t('idempotencyOutcomesSection')}</h2>
      <ul className="ml-4 list-disc space-y-2 text-sm">
        <li>{t('idempotencyOutcomeReplay')}</li>
        <li>{t('idempotencyOutcomeInflight')}</li>
        <li>{t('idempotencyOutcomeMismatch')}</li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">{t('idempotencyTtlSection')}</h2>
      <p className="text-sm">{t('idempotencyTtlBody')}</p>

      <h2 className="mt-8 text-xl font-semibold">{t('idempotencyAdviceSection')}</h2>
      <ul className="ml-4 list-disc space-y-1 text-sm">
        <li>{t('idempotencyAdviceUuid')}</li>
        <li>{t('idempotencyAdviceRecord')}</li>
        <li>{t('idempotencyAdviceNoDouble')}</li>
      </ul>
    </article>
  );
}
