import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

// Hand-curated guide for Kling AI — the auto-generated method pages list
// the JSON schema but don't warn loudly enough about the (mode × resolution
// × duration_seconds) bundle-key trap that causes "Pricing is not configured"
// errors when any of the three is omitted or mismatched.
export default async function KlingVideoGuidePage() {
  const t = await getTranslations('docs');
  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t('klingGuideTitle')}
        </h1>
        <p className="text-muted-foreground">{t('klingGuideIntro')}</p>
      </header>

      <section className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <h2 className="mb-2 text-base font-semibold">{t('klingGotchaTitle')}</h2>
        <p className="text-muted-foreground">{t('klingGotchaBody')}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('klingSectionRequired')}</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-semibold">{t('paramName')}</th>
                <th className="px-3 py-2 font-semibold">{t('paramType')}</th>
                <th className="px-3 py-2 font-semibold">{t('paramRequired')}</th>
                <th className="px-3 py-2 font-semibold">{t('paramDescription')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="px-3 py-2 font-mono">prompt</td>
                <td className="px-3 py-2 font-mono">string</td>
                <td className="px-3 py-2">✓</td>
                <td className="px-3 py-2">{t('klingParamPrompt')}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">mode</td>
                <td className="px-3 py-2 font-mono">enum</td>
                <td className="px-3 py-2">✓</td>
                <td className="px-3 py-2">
                  <code>standard</code> | <code>pro</code> — {t('klingParamMode')}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">resolution</td>
                <td className="px-3 py-2 font-mono">enum</td>
                <td className="px-3 py-2">✓</td>
                <td className="px-3 py-2">
                  <code>720p</code> | <code>1080p</code> — {t('klingParamResolution')}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">duration_seconds</td>
                <td className="px-3 py-2 font-mono">integer</td>
                <td className="px-3 py-2">✓</td>
                <td className="px-3 py-2">
                  <code>5</code> | <code>10</code> — {t('klingParamDuration')}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">input_images</td>
                <td className="px-3 py-2 font-mono">string[]</td>
                <td className="px-3 py-2">{t('klingI2vOnly')}</td>
                <td className="px-3 py-2">{t('klingParamInputImages')}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">aspect_ratio</td>
                <td className="px-3 py-2 font-mono">enum</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">
                  <code>16:9</code> | <code>9:16</code> | <code>1:1</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('klingValidComboMatrix')}</h2>
        <p className="text-sm text-muted-foreground">{t('klingMatrixBody')}</p>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-semibold">mode</th>
                <th className="px-3 py-2 font-semibold">resolution</th>
                <th className="px-3 py-2 font-semibold">duration_seconds</th>
              </tr>
            </thead>
            <tbody className="divide-y font-mono">
              <tr><td className="px-3 py-2">standard</td><td className="px-3 py-2">720p</td><td className="px-3 py-2">5, 10</td></tr>
              <tr><td className="px-3 py-2">pro</td><td className="px-3 py-2">1080p</td><td className="px-3 py-2">5, 10</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">{t('klingMatrixNote')}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('klingSectionT2v')}</h2>
        <p className="text-sm text-muted-foreground">{t('klingT2vBody')}</p>
        <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
          <code>{`curl -X POST https://api.aigenway.com/v1/generations \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "kling_ai",
    "model": "kling-v3",
    "method": "text_to_video",
    "params": {
      "prompt": "A red sports car drifting around a mountain curve at sunset, cinematic",
      "mode": "pro",
      "resolution": "1080p",
      "duration_seconds": 5,
      "aspect_ratio": "16:9"
    }
  }'`}</code>
        </pre>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('klingSectionI2v')}</h2>
        <p className="text-sm text-muted-foreground">{t('klingI2vBody')}</p>
        <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
          <code>{`curl -X POST https://api.aigenway.com/v1/generations \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "kling_ai",
    "model": "kling-v3",
    "method": "image_to_video",
    "params": {
      "prompt": "Subject turns their head slightly, light wind in their hair",
      "input_images": ["https://your-cdn.example.com/portrait.jpg"],
      "mode": "pro",
      "resolution": "1080p",
      "duration_seconds": 5
    }
  }'`}</code>
        </pre>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('klingSectionPolling')}</h2>
        <p className="text-sm text-muted-foreground">{t('klingPollingBody')}</p>
        <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
          <code>{`# After POST returns { "task_id": "task_..." }, poll the task endpoint:
curl https://api.aigenway.com/v1/tasks/<task_id> \\
  -H "Authorization: Bearer sk_live_..."

# Or the alias (equivalent, returns the same shape):
curl https://api.aigenway.com/v1/generations/<task_id> \\
  -H "Authorization: Bearer sk_live_..."

# When status == "SUCCEEDED", fetch the result files:
curl https://api.aigenway.com/v1/tasks/<task_id>/result \\
  -H "Authorization: Bearer sk_live_..."`}</code>
        </pre>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('klingSectionModels')}</h2>
        <p className="text-sm text-muted-foreground">{t('klingModelsBody')}</p>
        <ul className="ml-5 list-disc space-y-1 text-sm text-muted-foreground">
          <li><code>kling-v1-6</code> — {t('klingModelV16')}</li>
          <li><code>kling-2.6</code> — {t('klingModelV26')}</li>
          <li><code>kling-v3</code> — {t('klingModelV3')}</li>
          <li><code>kling-v2-1-master</code> — {t('klingModelV21Master')}</li>
          <li><code>kling-v2-5-turbo</code> — {t('klingModelV25Turbo')}</li>
        </ul>
      </section>

      <section className="rounded-md border bg-muted/40 p-4 text-sm">
        {t.rich('klingSeeAlso', {
          methods: (chunks) => (
            <Link href="/docs/methods/kling_ai" className="underline">
              {chunks}
            </Link>
          ),
          pricing: (chunks) => (
            <Link href="/dashboard/pricing" className="underline">
              {chunks}
            </Link>
          ),
          errors: (chunks) => (
            <Link href="/docs/errors" className="underline">
              {chunks}
            </Link>
          ),
        })}
      </section>
    </article>
  );
}
