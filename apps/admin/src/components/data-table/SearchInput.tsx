'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Input } from '@/components/ui/input';

interface Props {
  paramKey?: string;
  placeholder?: string;
  /** Debounce in ms before pushing URL update. */
  debounceMs?: number;
}

/**
 * Controlled search input that pushes its value into the URL searchParams
 * with debouncing. Server components above re-render automatically thanks
 * to Next.js routing.
 */
export function SearchInput({
  paramKey = 'q',
  placeholder = 'Поиск…',
  debounceMs = 300,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = searchParams.get(paramKey) ?? '';
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from URL when navigated externally (e.g. browser back).
  useEffect(() => {
    setValue(searchParams.get(paramKey) ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get(paramKey)]);

  function pushUpdate(next: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (next) sp.set(paramKey, next);
    else sp.delete(paramKey);
    // Reset to page 1 whenever the search changes.
    sp.delete('page');
    router.push(`${pathname}?${sp.toString()}`);
  }

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => pushUpdate(next), debounceMs);
  }

  function clear() {
    setValue('');
    pushUpdate('');
  }

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 pl-8 pr-8 text-sm"
        aria-label="search"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label="clear"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
