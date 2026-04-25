'use client';

import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProviderView, ModelView } from '@/lib/server-api';

interface Props {
  providers: ProviderView[];
  providerCode: string | null;
  modelCode: string | null;
  onProviderChange: (code: string) => void;
  onModelChange: (code: string) => void;
}

export function ProviderPicker({
  providers,
  providerCode,
  modelCode,
  onProviderChange,
  onModelChange,
}: Props) {
  const t = useTranslations('apiExplorer');
  const provider = providers.find((p) => p.code === providerCode);
  const models: ModelView[] = provider?.models ?? [];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>{t('provider')}</Label>
        <Select value={providerCode ?? ''} onValueChange={onProviderChange}>
          <SelectTrigger>
            <SelectValue placeholder={t('providerPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.code} value={p.code}>
                {p.publicName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>{t('model')}</Label>
        <Select
          value={modelCode ?? ''}
          onValueChange={onModelChange}
          disabled={!providerCode}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('modelPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.code} value={m.code}>
                {m.publicName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
