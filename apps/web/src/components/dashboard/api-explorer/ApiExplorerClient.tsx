'use client';

import { AlertTriangle, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { MethodView, ProviderView } from '@/lib/server-api';
import { ProviderPicker } from './ProviderPicker';
import { MethodPicker } from './MethodPicker';
import { ParamsForm, type ParamsState } from './ParamsForm';
import { EstimatePanel } from './EstimatePanel';
import { SendButton } from './SendButton';

interface Props {
  providers: ProviderView[];
  apiUrl: string;
  hasActiveApiKey: boolean;
}

function genUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'idem-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function buildCurl(
  apiUrl: string,
  path: string,
  body: Record<string, unknown>,
  apiKey: string,
  extraHeaders: Record<string, string> = {},
): string {
  const url = `${apiUrl}${path}`;
  const headerLines = [
    `  -H 'Authorization: Bearer ${apiKey || 'sk_live_<your_api_key>'}'`,
    `  -H 'Content-Type: application/json'`,
    ...Object.entries(extraHeaders).map(([k, v]) => `  -H '${k}: ${v}'`),
  ];
  const json = JSON.stringify(body, null, 2);
  return [
    `curl -X POST ${shellEscape(url)} \\`,
    headerLines.join(' \\\n'),
    ` \\\n  -d ${shellEscape(json)}`,
  ].join('\n');
}

export function ApiExplorerClient({ providers, apiUrl, hasActiveApiKey }: Props) {
  const t = useTranslations('apiExplorer');
  const [providerCode, setProviderCode] = useState<string | null>(null);
  const [modelCode, setModelCode] = useState<string | null>(null);
  const [methodCode, setMethodCode] = useState<string | null>(null);
  const [paramsByMethod, setParamsByMethod] = useState<Record<string, ParamsState>>({});
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => genUuid());

  const provider = providers.find((p) => p.code === providerCode) ?? null;
  const model = provider?.models?.find((m) => m.code === modelCode) ?? null;
  const methods: MethodView[] = useMemo(
    () =>
      (model?.methods ?? []).map((m) => ({
        ...m,
        providerCode: provider?.code ?? '',
        modelCode: model?.code ?? '',
      })),
    [model, provider],
  );
  const method = methods.find((m) => m.code === methodCode) ?? null;
  const paramsKey = method ? `${provider?.code}/${model?.code}/${method.code}` : '';
  const params: ParamsState = paramsByMethod[paramsKey] ?? {};

  function setParams(next: ParamsState) {
    setParamsByMethod({ ...paramsByMethod, [paramsKey]: next });
  }

  function handleProviderChange(code: string) {
    setProviderCode(code);
    setModelCode(null);
    setMethodCode(null);
  }
  function handleModelChange(code: string) {
    setModelCode(code);
    setMethodCode(null);
  }

  // Build payload (drop undefined)
  const cleanedParams = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue;
      out[k] = v;
    }
    return out;
  }, [params]);

  const estimateBody = useMemo(() => {
    if (!provider || !model || !method) return null;
    return {
      provider: provider.code,
      model: model.code,
      method: method.code,
      params: cleanedParams,
    };
  }, [provider, model, method, cleanedParams]);

  const generateBody = estimateBody;

  const estimateCurl = estimateBody
    ? buildCurl(apiUrl, '/v1/estimate', estimateBody, apiKeyInput)
    : '';
  const generateCurl = generateBody
    ? buildCurl(apiUrl, '/v1/generations', generateBody, apiKeyInput, {
        'Idempotency-Key': idempotencyKey,
      })
    : '';

  const ready = Boolean(provider && model && method);

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left: pickers */}
      <div className="space-y-4 lg:col-span-3">
        <div className="rounded-md border bg-background p-4">
          <ProviderPicker
            providers={providers}
            providerCode={providerCode}
            modelCode={modelCode}
            onProviderChange={handleProviderChange}
            onModelChange={handleModelChange}
          />
          <div className="mt-4">
            <MethodPicker
              methods={methods}
              methodCode={methodCode}
              onChange={setMethodCode}
              disabled={!modelCode}
            />
          </div>
        </div>

        {!hasActiveApiKey ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-2">
              <p>{t('noKeyWarning')}</p>
              <Button asChild size="sm" variant="outline">
                <Link href="/api-keys">{t('createKeyCta')}</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t('keyHint')}</p>
          </div>
        )}
      </div>

      {/* Center: params */}
      <div className="space-y-4 lg:col-span-5">
        <div className="rounded-md border bg-background p-4">
          <h3 className="mb-3 text-sm font-semibold">{t('parametersTitle')}</h3>
          {ready ? (
            <ParamsForm
              schema={method?.parametersSchema ?? null}
              values={params}
              onChange={setParams}
            />
          ) : (
            <div className="rounded-md border border-dashed bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
              {t('selectMethodFirst')}
            </div>
          )}
        </div>
      </div>

      {/* Right: actions */}
      <div className="space-y-4 lg:col-span-4">
        <div className="space-y-3 rounded-md border bg-background p-4">
          <h3 className="text-sm font-semibold">{t('keysTitle')}</h3>

          <div className="space-y-1">
            <Label htmlFor="api-key-paste">{t('apiKeyLabel')}</Label>
            <Input
              id="api-key-paste"
              type="password"
              autoComplete="off"
              placeholder="sk_live_..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('apiKeyHint')}</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="idem-key">{t('idempotencyKeyLabel')}</Label>
            <div className="flex gap-2">
              <Input
                id="idem-key"
                value={idempotencyKey}
                onChange={(e) => setIdempotencyKey(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIdempotencyKey(genUuid())}
              >
                {t('regen')}
              </Button>
            </div>
          </div>
        </div>

        {ready ? (
          <div className="space-y-4 rounded-md border bg-background p-4">
            <EstimatePanel curl={estimateCurl} />
            <SendButton curl={generateCurl} />
            <p className="text-xs text-muted-foreground">{t('curlScopeNote')}</p>
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            {t('selectMethodFirst')}
          </div>
        )}
      </div>
    </div>
  );
}
