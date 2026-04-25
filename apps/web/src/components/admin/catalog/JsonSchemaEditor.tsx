'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  label: string;
  value: unknown;
  onChange: (parsed: unknown, raw: string, valid: boolean) => void;
  rows?: number;
  hint?: string;
}

export function JsonSchemaEditor({ label, value, onChange, rows = 12, hint }: Props) {
  const t = useTranslations('admin.catalog');
  const [raw, setRaw] = useState<string>(() =>
    value === undefined ? '' : JSON.stringify(value, null, 2),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // initial validation
    validate(raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validate(text: string) {
    if (text.trim() === '') {
      setError(null);
      onChange(undefined, text, true);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      setError(null);
      onChange(parsed, text, true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('jsonInvalid');
      setError(msg);
      onChange(undefined, text, false);
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea
        rows={rows}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => validate(raw)}
        className="font-mono text-xs"
        spellCheck={false}
      />
      {error ? (
        <p className="text-xs text-destructive">
          {t('jsonInvalid')}: {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
