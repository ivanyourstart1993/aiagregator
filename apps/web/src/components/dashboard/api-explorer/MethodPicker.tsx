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
import type { MethodView } from '@/lib/server-api';

interface Props {
  methods: MethodView[];
  methodCode: string | null;
  onChange: (code: string) => void;
  disabled?: boolean;
}

export function MethodPicker({ methods, methodCode, onChange, disabled }: Props) {
  const t = useTranslations('apiExplorer');
  return (
    <div className="space-y-1">
      <Label>{t('method')}</Label>
      <Select value={methodCode ?? ''} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder={t('methodPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {methods.map((m) => (
            <SelectItem key={m.code} value={m.code}>
              {m.publicName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
