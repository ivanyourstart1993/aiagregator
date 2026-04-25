'use client';

import { useTranslations } from 'next-intl';
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
import type { JsonSchemaLike, JsonSchemaProperty } from '@/lib/server-api';

export type ParamValue = string | number | boolean | string[] | undefined;
export type ParamsState = Record<string, ParamValue>;

interface Props {
  schema: JsonSchemaLike | null;
  values: ParamsState;
  onChange: (values: ParamsState) => void;
}

function isRequired(schema: JsonSchemaLike | null, key: string): boolean {
  return Boolean(schema?.required?.includes(key));
}

function FieldRow({
  name,
  schema,
  required,
  value,
  onChange,
}: {
  name: string;
  schema: JsonSchemaProperty;
  required: boolean;
  value: ParamValue;
  onChange: (v: ParamValue) => void;
}) {
  const label = (
    <Label className="flex items-center gap-1">
      <span className="font-mono text-xs">{name}</span>
      {required ? <span className="text-destructive">*</span> : null}
    </Label>
  );

  if (schema.enum && Array.isArray(schema.enum)) {
    return (
      <div className="space-y-1">
        {label}
        <Select
          value={typeof value === 'string' ? value : ''}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {schema.enum.map((v) => (
              <SelectItem key={String(v)} value={String(v)}>
                {String(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {schema.description ? (
          <p className="text-xs text-muted-foreground">{schema.description}</p>
        ) : null}
      </div>
    );
  }

  if (schema.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <div className="space-y-0.5">
          {label}
          {schema.description ? (
            <p className="text-xs text-muted-foreground">{schema.description}</p>
          ) : null}
        </div>
        <Switch
          checked={Boolean(value)}
          onCheckedChange={(v) => onChange(v)}
        />
      </div>
    );
  }

  if (schema.type === 'array') {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-1">
        {label}
        <Textarea
          rows={3}
          value={arr.join('\n')}
          onChange={(e) =>
            onChange(
              e.target.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
          placeholder={'one item per line'}
        />
        {schema.description ? (
          <p className="text-xs text-muted-foreground">{schema.description}</p>
        ) : null}
      </div>
    );
  }

  if (schema.type === 'integer' || schema.type === 'number') {
    return (
      <div className="space-y-1">
        {label}
        <Input
          type="number"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              onChange(undefined);
              return;
            }
            const n = schema.type === 'integer' ? parseInt(raw, 10) : parseFloat(raw);
            onChange(Number.isFinite(n) ? n : undefined);
          }}
        />
        {schema.description ? (
          <p className="text-xs text-muted-foreground">{schema.description}</p>
        ) : null}
      </div>
    );
  }

  // string / fallback
  const longField =
    name.toLowerCase().includes('prompt') || name.toLowerCase().includes('text');
  return (
    <div className="space-y-1">
      {label}
      {longField ? (
        <Textarea
          rows={3}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {schema.description ? (
        <p className="text-xs text-muted-foreground">{schema.description}</p>
      ) : null}
    </div>
  );
}

export function ParamsForm({ schema, values, onChange }: Props) {
  const t = useTranslations('apiExplorer');
  const properties = schema?.properties;

  if (!schema || !properties || Object.keys(properties).length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
        {t('noParams')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Object.entries(properties).map(([name, propSchema]) => (
        <FieldRow
          key={name}
          name={name}
          schema={propSchema}
          required={isRequired(schema, name)}
          value={values[name]}
          onChange={(v) => onChange({ ...values, [name]: v })}
        />
      ))}
    </div>
  );
}
