import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

// Hand-curated guide for the Gemini 2.5 text + text-embedding-004 surface.
// The auto-generated /docs/methods/google_banana/... pages render the bare
// JSON example seeded in the catalog; this page adds the common cURL recipes
// (basic chat, structured output, function calling, batch embeddings, custom
// dimensionality) in one place so users don't have to stitch them together.
export default async function GeminiTextGuidePage() {
  const t = await getTranslations('docs');
  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t('geminiTextGuideTitle')}
        </h1>
        <p className="text-muted-foreground">{t('geminiTextGuideIntro')}</p>
        <div className="flex flex-wrap gap-2 pt-2 text-xs">
          <Link
            href="/docs/methods/google_banana/gemini-2.5-pro/text_generation"
            className="rounded-md border px-2 py-1 hover:bg-muted"
          >
            gemini-2.5-pro
          </Link>
          <Link
            href="/docs/methods/google_banana/gemini-2.5-flash/text_generation"
            className="rounded-md border px-2 py-1 hover:bg-muted"
          >
            gemini-2.5-flash
          </Link>
          <Link
            href="/docs/methods/google_banana/gemini-2.5-flash-lite/text_generation"
            className="rounded-md border px-2 py-1 hover:bg-muted"
          >
            gemini-2.5-flash-lite
          </Link>
          <Link
            href="/docs/methods/google_banana/text-embedding-004/embedding"
            className="rounded-md border px-2 py-1 hover:bg-muted"
          >
            text-embedding-004
          </Link>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('geminiTextSectionParams')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('geminiTextParamsBody')}
        </p>
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
                <td className="px-3 py-2">{t('paramPromptDesc')}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">system_instruction</td>
                <td className="px-3 py-2 font-mono">string</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">{t('paramSystemDesc')}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">response_mime_type</td>
                <td className="px-3 py-2 font-mono">enum</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">
                  text/plain | application/json. {t('paramMimeDesc')}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">response_schema</td>
                <td className="px-3 py-2 font-mono">object</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">{t('paramSchemaDesc')}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">tools</td>
                <td className="px-3 py-2 font-mono">array</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">{t('paramToolsDesc')}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">temperature</td>
                <td className="px-3 py-2 font-mono">number</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">0.0–2.0 (default 1.0)</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">max_output_tokens</td>
                <td className="px-3 py-2 font-mono">integer</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">{t('paramMaxOutDesc')}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">top_p</td>
                <td className="px-3 py-2 font-mono">number</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">0.0–1.0</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('geminiTextSectionBasic')}</h2>
        <p className="text-sm text-muted-foreground">{t('geminiTextBasicBody')}</p>
        <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
          <code>{`curl -X POST https://api.aigenway.com/v1/generations \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "google_banana",
    "model": "gemini-2.5-flash",
    "method": "text_generation",
    "params": {
      "system_instruction": "Ты — лаконичный помощник. Отвечай в одно предложение.",
      "prompt": "Почему небо голубое?",
      "temperature": 0.4,
      "max_output_tokens": 256
    }
  }'`}</code>
        </pre>
        <p className="text-xs text-muted-foreground">{t('geminiTextResponseShape')}</p>
        <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
          <code>{`{
  "task_id": "task_01HXYZ...",
  "status": "SUCCEEDED",
  "result": {
    "text": "Голубой цвет неба обусловлен рассеянием Рэлея...",
    "finish_reason": "STOP",
    "model": "gemini-2.5-flash",
    "usage": { "input_tokens": 22, "output_tokens": 31, "total_tokens": 53 },
    "files": []
  }
}`}</code>
        </pre>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('geminiTextSectionJson')}</h2>
        <p className="text-sm text-muted-foreground">{t('geminiTextJsonBody')}</p>
        <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
          <code>{`curl -X POST https://api.aigenway.com/v1/generations \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "google_banana",
    "model": "gemini-2.5-pro",
    "method": "text_generation",
    "params": {
      "prompt": "Извлеки сущности из текста: «Apple купила за $2 млрд в 2024 году компанию Pixelmator»",
      "response_mime_type": "application/json",
      "response_schema": {
        "type": "object",
        "properties": {
          "buyer":  { "type": "string" },
          "target": { "type": "string" },
          "amount_usd": { "type": "number" },
          "year": { "type": "integer" }
        },
        "required": ["buyer", "target"]
      }
    }
  }'`}</code>
        </pre>
        <p className="text-xs text-muted-foreground">{t('geminiTextJsonNote')}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('geminiTextSectionTools')}</h2>
        <p className="text-sm text-muted-foreground">{t('geminiTextToolsBody')}</p>
        <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
          <code>{`curl -X POST https://api.aigenway.com/v1/generations \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "google_banana",
    "model": "gemini-2.5-pro",
    "method": "text_generation",
    "params": {
      "prompt": "Какая сейчас погода в Москве?",
      "tools": [{
        "function_declarations": [{
          "name": "get_weather",
          "description": "Получить текущую погоду в городе",
          "parameters": {
            "type": "object",
            "properties": {
              "city": { "type": "string" }
            },
            "required": ["city"]
          }
        }]
      }]
    }
  }'`}</code>
        </pre>
        <p className="text-xs text-muted-foreground">{t('geminiTextToolsResponseHint')}</p>
        <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
          <code>{`{
  "result": {
    "text": "",
    "finish_reason": "TOOL_CALL",
    "tool_calls": [
      { "name": "get_weather", "args": { "city": "Москва" } }
    ],
    "usage": { "input_tokens": 47, "output_tokens": 12, "total_tokens": 59 },
    "files": []
  }
}`}</code>
        </pre>
      </section>

      <section className="space-y-3 border-t pt-6">
        <h2 className="text-xl font-semibold">{t('geminiEmbedSectionBasic')}</h2>
        <p className="text-sm text-muted-foreground">{t('geminiEmbedIntro')}</p>
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
                <td className="px-3 py-2 font-mono">inputs</td>
                <td className="px-3 py-2 font-mono">string[]</td>
                <td className="px-3 py-2">✓</td>
                <td className="px-3 py-2">{t('paramInputsDesc')}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">task_type</td>
                <td className="px-3 py-2 font-mono">enum</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">{t('paramTaskTypeDesc')}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">output_dimensionality</td>
                <td className="px-3 py-2 font-mono">integer</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">8–768. {t('paramOutDimDesc')}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">title</td>
                <td className="px-3 py-2 font-mono">string</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">{t('paramTitleDesc')}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          task_type ∈ {'{'} RETRIEVAL_DOCUMENT, RETRIEVAL_QUERY, SEMANTIC_SIMILARITY,
          CLASSIFICATION, CLUSTERING, QUESTION_ANSWERING, FACT_VERIFICATION,
          CODE_RETRIEVAL_QUERY {'}'}
        </p>
        <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
          <code>{`curl -X POST https://api.aigenway.com/v1/generations \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "google_banana",
    "model": "text-embedding-004",
    "method": "embedding",
    "params": {
      "inputs": [
        "Беспроводные наушники с активным шумоподавлением",
        "Шапка зимняя шерстяная мужская",
        "Кофемашина автоматическая с капучинатором"
      ],
      "task_type": "RETRIEVAL_DOCUMENT"
    }
  }'`}</code>
        </pre>
        <p className="text-xs text-muted-foreground">{t('geminiTextResponseShape')}</p>
        <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
          <code>{`{
  "task_id": "task_01HXYZ...",
  "status": "SUCCEEDED",
  "result": {
    "model": "text-embedding-004",
    "count": 3,
    "dimension": 768,
    "embeddings": [
      [0.0123, -0.0456, 0.0789, ...],
      [-0.0034, 0.0212, -0.0561, ...],
      [0.0418, -0.0102, 0.0337, ...]
    ],
    "files": []
  }
}`}</code>
        </pre>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('geminiEmbedSectionTruncated')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('geminiEmbedTruncatedBody')}
        </p>
        <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
          <code>{`curl -X POST https://api.aigenway.com/v1/generations \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "google_banana",
    "model": "text-embedding-004",
    "method": "embedding",
    "params": {
      "inputs": ["search query: купить ноутбук asus"],
      "task_type": "RETRIEVAL_QUERY",
      "output_dimensionality": 256
    }
  }'`}</code>
        </pre>
      </section>

      <section className="rounded-md border bg-muted/40 p-4 text-sm">
        {t.rich('geminiTextSeeAlso', {
          methods: (chunks) => (
            <Link href="/docs/methods/google_banana" className="underline">
              {chunks}
            </Link>
          ),
          pricing: (chunks) => (
            <Link href="/dashboard/pricing" className="underline">
              {chunks}
            </Link>
          ),
          playground: (chunks) => (
            <Link href="/dashboard/playground" className="underline">
              {chunks}
            </Link>
          ),
        })}
      </section>
    </article>
  );
}
