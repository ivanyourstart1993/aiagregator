'use client';

import { useTranslations } from 'next-intl';
import type { JsonSchemaLike } from '@/lib/server-api';
import { JsonCodeBlock } from '@/components/docs/JsonCodeBlock';
import { ParametersTable } from '@/components/docs/ParametersTable';
import { Badge } from '@/components/ui/badge';

interface Props {
  publicName: string;
  description?: string | null;
  parametersSchema: JsonSchemaLike | undefined;
  exampleRequest?: unknown;
  exampleResponse?: unknown;
  supportsSync: boolean;
  supportsAsync: boolean;
}

export function MethodPreview({
  publicName,
  description,
  parametersSchema,
  exampleRequest,
  exampleResponse,
  supportsSync,
  supportsAsync,
}: Props) {
  const t = useTranslations('docs');
  const tCat = useTranslations('admin.catalog');
  return (
    <div className="space-y-6 rounded-md border p-4">
      <div className="text-xs uppercase text-muted-foreground">{tCat('previewBadge')}</div>
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">{publicName}</h2>
        <div className="flex flex-wrap gap-2">
          {supportsSync ? <Badge>{t('syncSupported')}</Badge> : null}
          {supportsAsync ? <Badge variant="secondary">{t('asyncSupported')}</Badge> : null}
        </div>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </header>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">{t('parameters')}</h3>
        <ParametersTable schema={parametersSchema ?? null} />
      </section>

      {exampleRequest !== undefined ? (
        <section className="space-y-2">
          <h3 className="text-lg font-semibold">{t('exampleRequest')}</h3>
          <JsonCodeBlock value={exampleRequest} />
        </section>
      ) : null}

      {exampleResponse !== undefined ? (
        <section className="space-y-2">
          <h3 className="text-lg font-semibold">{t('exampleResponse')}</h3>
          <JsonCodeBlock value={exampleResponse} />
        </section>
      ) : null}
    </div>
  );
}
