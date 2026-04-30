'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** Current page (1-indexed). */
  page: number;
  /** Items per page. */
  pageSize: number;
  /** Total items across all pages. */
  total: number;
  /** Show items count text (e.g. "1–50 of 234"). Default true. */
  showCount?: boolean;
  /** searchParam key for the page number (default: 'page'). */
  paramKey?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  showCount = true,
  paramKey = 'page',
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function goto(p: number) {
    const sp = new URLSearchParams(searchParams.toString());
    if (p <= 1) sp.delete(paramKey);
    else sp.set(paramKey, String(p));
    router.push(`${pathname}?${sp.toString()}`);
  }

  // Build a compact page list: 1 … (p-1) p (p+1) … N.
  const pages = useMemo(() => {
    const set = new Set<number>([1, totalPages, page - 1, page, page + 1]);
    return [...set]
      .filter((p) => p >= 1 && p <= totalPages)
      .sort((a, b) => a - b);
  }, [page, totalPages]);

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      {showCount ? (
        <div>
          {total === 0 ? (
            'Пусто'
          ) : (
            <>
              <span className="font-mono">{from}</span>–
              <span className="font-mono">{to}</span> из{' '}
              <span className="font-mono">{total}</span>
            </>
          )}
        </div>
      ) : (
        <div />
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => goto(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent/50 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pages.map((p, i) => {
          const showEllipsis = i > 0 && pages[i - 1]! < p - 1;
          return (
            <span key={p} className="flex items-center gap-1">
              {showEllipsis && <span className="px-1">…</span>}
              <button
                type="button"
                onClick={() => goto(p)}
                aria-current={p === page ? 'page' : undefined}
                className={cn(
                  'h-7 min-w-7 rounded-md px-2 text-xs transition-colors',
                  p === page
                    ? 'bg-accent text-accent-foreground'
                    : 'border border-border hover:bg-accent/50',
                )}
              >
                {p}
              </button>
            </span>
          );
        })}
        <button
          type="button"
          onClick={() => goto(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent/50 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
