'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

const RANGES = [
  { value: '1d', label: '24ч' },
  { value: '7d', label: '7д' },
  { value: '30d', label: '30д' },
  { value: '90d', label: '90д' },
];

export function DateRangePicker({ paramKey = 'range' }: { paramKey?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(paramKey) ?? '30d';

  function set(value: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value === '30d') sp.delete(paramKey);
    else sp.set(paramKey, value);
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <div
      role="tablist"
      aria-label="Date range"
      className="inline-flex h-9 items-center gap-0.5 rounded-md border border-border bg-card p-0.5"
    >
      {RANGES.map((r) => {
        const active = current === r.value;
        return (
          <button
            key={r.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => set(r.value)}
            className={cn(
              'h-8 rounded-md px-3 text-xs font-medium transition-colors',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
