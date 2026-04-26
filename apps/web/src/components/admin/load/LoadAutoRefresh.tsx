'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export function LoadAutoRefresh() {
  const t = useTranslations('admin.load');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [last, setLast] = useState<Date>(new Date());

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
      setLast(new Date());
    }, 10_000);
    return () => clearInterval(id);
  }, [router]);

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span>
        {t('lastUpdated')}: {last.toLocaleTimeString()}
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          router.refresh();
          setLast(new Date());
        }}
      >
        <RefreshCw className="h-3 w-3" />
        {tCommon('refresh')}
      </Button>
    </div>
  );
}
