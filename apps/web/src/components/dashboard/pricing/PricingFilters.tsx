'use client';

import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface Props {
  providers: string[];
  methods: string[];
  provider: string;
  method: string;
  search: string;
  onProvider: (v: string) => void;
  onMethod: (v: string) => void;
  onSearch: (v: string) => void;
}

const ALL = '__all__';

export function PricingFilters({
  providers,
  methods,
  provider,
  method,
  search,
  onProvider,
  onMethod,
  onSearch,
}: Props) {
  const t = useTranslations('pricing');
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Select
        value={provider || ALL}
        onValueChange={(v) => onProvider(v === ALL ? '' : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('filterProvider')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('filterAll')}</SelectItem>
          {providers.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={method || ALL} onValueChange={(v) => onMethod(v === ALL ? '' : v)}>
        <SelectTrigger>
          <SelectValue placeholder={t('filterMethod')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('filterAll')}</SelectItem>
          {methods.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        placeholder={t('searchPlaceholder')}
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
    </div>
  );
}
