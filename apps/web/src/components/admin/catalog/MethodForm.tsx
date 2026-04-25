'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  CatalogStatus,
  JsonSchemaLike,
  MethodAdminView,
} from '@/lib/server-api';
import {
  createMethodAction,
  updateMethodAction,
} from '@/app/[locale]/(admin)/admin/catalog/actions';
import { JsonSchemaEditor } from './JsonSchemaEditor';
import { MethodPreview } from './MethodPreview';

const STATUSES: CatalogStatus[] = ['ACTIVE', 'DISABLED', 'DEPRECATED'];

interface Props {
  mode: 'create' | 'edit';
  modelId?: string;
  method?: MethodAdminView;
}

export function MethodForm({ mode, modelId, method }: Props) {
  const t = useTranslations('admin.catalog');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [code, setCode] = useState(method?.code ?? '');
  const [publicName, setPublicName] = useState(method?.publicName ?? '');
  const [description, setDescription] = useState(method?.description ?? '');
  const [supportsSync, setSupportsSync] = useState(method?.supportsSync ?? true);
  const [supportsAsync, setSupportsAsync] = useState(method?.supportsAsync ?? false);
  const [sortOrder, setSortOrder] = useState(String(method?.sortOrder ?? 0));
  const [status, setStatus] = useState<CatalogStatus>(method?.status ?? 'ACTIVE');

  const [parametersSchema, setParametersSchema] = useState<JsonSchemaLike | undefined>(
    (method?.parametersSchema as JsonSchemaLike | undefined) ?? undefined,
  );
  const [parametersValid, setParametersValid] = useState(true);

  const [exampleRequest, setExampleRequest] = useState<unknown>(method?.exampleRequest);
  const [exampleResponse, setExampleResponse] = useState<unknown>(method?.exampleResponse);
  const [exReqValid, setExReqValid] = useState(true);
  const [exResValid, setExResValid] = useState(true);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parametersValid || !exReqValid || !exResValid) {
      toast.error(t('jsonInvalid'));
      return;
    }
    const sortOrderN = Number.parseInt(sortOrder, 10);
    const baseBody = {
      publicName: publicName.trim(),
      description: description?.trim() || null,
      parametersSchema: parametersSchema ?? { type: 'object', properties: {} },
      exampleRequest,
      exampleResponse,
      supportsSync,
      supportsAsync,
      sortOrder: Number.isFinite(sortOrderN) ? sortOrderN : 0,
      status,
    };

    startTransition(async () => {
      if (mode === 'create') {
        if (!modelId) return;
        const res = await createMethodAction(modelId, {
          ...baseBody,
          code: code.trim(),
        });
        if (!res.ok) {
          toast.error(t('saveFailed'));
          return;
        }
        toast.success(t('saved'));
        router.push(`/admin/catalog/methods/${res.data!.id}`);
      } else {
        const res = await updateMethodAction(method!.id, baseBody);
        if (!res.ok) toast.error(t('saveFailed'));
        else toast.success(t('saved'));
      }
    });
  }

  return (
    <Tabs defaultValue="form">
      <TabsList>
        <TabsTrigger value="form">{t('tabForm')}</TabsTrigger>
        <TabsTrigger value="preview">{t('tabPreview')}</TabsTrigger>
      </TabsList>
      <TabsContent value="form">
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('methodCode')}>
            <Input
              value={code}
              disabled={mode === 'edit'}
              onChange={(e) => setCode(e.target.value)}
              placeholder="text_to_image"
              className="font-mono"
            />
          </Field>
          <Field label={t('methodPublicName')}>
            <Input
              value={publicName}
              onChange={(e) => setPublicName(e.target.value)}
              placeholder="Text to image"
            />
          </Field>
          <Field label={t('description')}>
            <Textarea
              rows={3}
              value={description ?? ''}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('supportsSync')}>
              <Switch checked={supportsSync} onCheckedChange={setSupportsSync} />
            </Field>
            <Field label={t('supportsAsync')}>
              <Switch checked={supportsAsync} onCheckedChange={setSupportsAsync} />
            </Field>
          </div>

          <JsonSchemaEditor
            label={t('parametersSchema')}
            hint={t('parametersSchemaHint')}
            value={parametersSchema}
            onChange={(parsed, _raw, valid) => {
              setParametersSchema(parsed as JsonSchemaLike | undefined);
              setParametersValid(valid);
            }}
          />

          <JsonSchemaEditor
            label={t('exampleRequest')}
            value={exampleRequest}
            rows={8}
            onChange={(parsed, _raw, valid) => {
              setExampleRequest(parsed);
              setExReqValid(valid);
            }}
          />

          <JsonSchemaEditor
            label={t('exampleResponse')}
            value={exampleResponse}
            rows={8}
            onChange={(parsed, _raw, valid) => {
              setExampleResponse(parsed);
              setExResValid(valid);
            }}
          />

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('sortOrder')}>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </Field>
            <Field label={t('status')}>
              <Select value={status} onValueChange={(v) => setStatus(v as CatalogStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`statusValue.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={pending}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {mode === 'create' ? tCommon('create') : tCommon('save')}
            </Button>
          </div>
        </form>
      </TabsContent>
      <TabsContent value="preview">
        <MethodPreview
          publicName={publicName || code}
          description={description}
          parametersSchema={parametersSchema}
          exampleRequest={exampleRequest}
          exampleResponse={exampleResponse}
          supportsSync={supportsSync}
          supportsAsync={supportsAsync}
        />
      </TabsContent>
    </Tabs>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
