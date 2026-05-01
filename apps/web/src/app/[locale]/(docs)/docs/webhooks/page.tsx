import { getTranslations } from 'next-intl/server';

const SAMPLE_PAYLOAD = `{
  "event": "generation.completed",
  "task_id": "cmomwuy0m000qbr0371src20a",
  "status": "succeeded",
  "provider": "google_banana",
  "model": "gemini-3.1-flash-image-preview",
  "method": "image_edit",
  "charged_amount": "12000000",
  "currency": "USD",
  "result": {
    "type": "image",
    "url": "https://api.aigenway.com/v1/files/results/<userId>/<taskId>/image_0-...png",
    "mime_type": "image/png",
    "available_until": "2026-05-31T12:50:51.831Z",
    "files": [
      {
        "type": "image",
        "url": "https://api.aigenway.com/v1/files/results/<userId>/<taskId>/image_0-...png",
        "mime_type": "image/png",
        "available_until": "2026-05-31T12:50:51.831Z"
      }
    ]
  },
  "error": null
}`;

const SIGNATURE_NODE = `import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody: string, header: string, secret: string): boolean {
  // Header looks like: "sha256=<hex>"
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const got = header.replace(/^sha256=/, '');
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(expected, 'hex'));
}`;

const SIGNATURE_PHP = `<?php
function verify(string $rawBody, string $header, string $secret): bool {
    $got = preg_replace('/^sha256=/', '', $header);
    $expected = hash_hmac('sha256', $rawBody, $secret);
    return hash_equals($expected, $got);
}`;

export default async function WebhooksPage() {
  const t = await getTranslations('docs');
  return (
    <article className="prose max-w-none space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('webhooksTitle')}</h1>
      <p className="text-muted-foreground">{t('webhooksBody')}</p>

      <h2 className="mt-8 text-xl font-semibold">{t('webhooksHowSection')}</h2>
      <p className="text-sm">{t('webhooksHowBody')}</p>

      <h2 className="mt-8 text-xl font-semibold">{t('webhooksHeadersSection')}</h2>
      <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
        <code>{`POST <your callback_url>
Content-Type: application/json
User-Agent: aiagg-webhook/1.0
X-Aggregator-Event: generation.completed
X-Aggregator-Task-Id: <task_id>
X-Aggregator-Signature: sha256=<hex>`}</code>
      </pre>

      <h2 className="mt-8 text-xl font-semibold">{t('webhooksPayloadSection')}</h2>
      <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
        <code>{SAMPLE_PAYLOAD}</code>
      </pre>
      <p className="text-sm text-muted-foreground">{t('webhooksPayloadNotes')}</p>

      <h2 className="mt-8 text-xl font-semibold">{t('webhooksSignatureSection')}</h2>
      <p className="text-sm">{t('webhooksSignatureBody')}</p>
      <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
        <code>{SIGNATURE_NODE}</code>
      </pre>
      <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
        <code>{SIGNATURE_PHP}</code>
      </pre>

      <h2 className="mt-8 text-xl font-semibold">{t('webhooksRetrySection')}</h2>
      <ul className="ml-4 list-disc space-y-1 text-sm">
        <li>{t('webhooksRetry2xx')}</li>
        <li>{t('webhooksRetryAttempts')}</li>
        <li>{t('webhooksRetryTimeout')}</li>
        <li>{t('webhooksRetryIdempotent')}</li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">{t('webhooksDebugSection')}</h2>
      <p className="text-sm">{t('webhooksDebugBody')}</p>
    </article>
  );
}
