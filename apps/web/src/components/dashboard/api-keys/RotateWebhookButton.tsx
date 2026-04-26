'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Copy, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { rotateWebhookSecretAction } from '@/app/[locale]/(dashboard)/api-keys/actions';

interface Props {
  id: string;
  disabled?: boolean;
}

export function RotateWebhookButton({ id, disabled }: Props) {
  const t = useTranslations('apiKeys');
  const [pending, startTransition] = useTransition();
  const [secret, setSecret] = useState<string | null>(null);

  function trigger() {
    if (!confirm(t('rotateWebhookConfirm'))) return;
    startTransition(async () => {
      const res = await rotateWebhookSecretAction(id);
      if (res.ok && res.webhookSecret) {
        toast.success(t('rotateWebhookSuccess'));
        setSecret(res.webhookSecret);
      } else {
        toast.error(t('rotateWebhookFailed'));
      }
    });
  }

  function copy() {
    if (!secret) return;
    void navigator.clipboard.writeText(secret);
    toast.success(t('copied'));
  }

  return (
    <>
      <Button size="sm" variant="ghost" disabled={pending || disabled} onClick={trigger}>
        <RotateCw className="h-4 w-4" />
        {t('rotateWebhookSecret')}
      </Button>
      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rotateDialogTitle')}</DialogTitle>
            <DialogDescription>{t('rotateDialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted px-3 py-2 font-mono text-sm break-all">
            {secret}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={copy}>
              <Copy className="h-4 w-4" />
              {t('copy')}
            </Button>
            <Button type="button" onClick={() => setSecret(null)}>
              {t('savedKey')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
