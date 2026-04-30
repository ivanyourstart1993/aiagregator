'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Option {
  value: string;
  label: string;
}

interface Props {
  paramKey: string;
  options: Option[];
  placeholder?: string;
  /** Special value meaning "no filter". Default '__all__'. */
  allValue?: string;
  allLabel?: string;
}

/**
 * URL-state filter dropdown. Resets page=1 on change.
 */
export function FilterSelect({
  paramKey,
  options,
  placeholder,
  allValue = '__all__',
  allLabel = 'Все',
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(paramKey) ?? allValue;

  function onChange(next: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === allValue) sp.delete(paramKey);
    else sp.set(paramKey, next);
    sp.delete('page');
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-44 text-xs" aria-label={paramKey}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={allValue}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
