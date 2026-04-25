'use client';

import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface Props {
  curl: string;
}

export function SendButton({ curl }: Props) {
  const t = useTranslations('apiExplorer');
  const tCommon = useTranslations('common');

  async function copy() {
    try {
      await navigator.clipboard.writeText(curl);
      toast.success(tCommon('copied'));
    } catch {
      toast.error(tCommon('error'));
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{t('generateCurlTitle')}</h4>
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          <Copy className="h-3 w-3" />
          {tCommon('copy')}
        </Button>
      </div>
      <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">{curl}</pre>
    </div>
  );
}
