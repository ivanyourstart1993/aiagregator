'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cn } from '@/lib/utils';

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);

  function refresh() {
    setSpinning(true);
    startTransition(() => {
      router.refresh();
    });
    // Stop spinner after a small delay regardless — useTransition completes
    // when the new RSC payload arrives, but visual feedback should always
    // be brief.
    setTimeout(() => setSpinning(false), 600);
  }

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={pending}
      aria-label="Refresh"
      title="Обновить"
      className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-50"
    >
      <RefreshCw
        className={cn('h-3.5 w-3.5', (pending || spinning) && 'animate-spin')}
      />
    </button>
  );
}
