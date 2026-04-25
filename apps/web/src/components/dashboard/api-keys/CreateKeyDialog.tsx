'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createKey } from '@/app/[locale]/(dashboard)/api-keys/actions';

export function CreateKeyDialog() {
  const t = useTranslations('apiKeys');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pending, startTransition] = useTransition();
  const [plaintext, setPlaintext] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      const res = await createKey({ name: name.trim() });
      if (!res.ok || !res.plaintext) {
        toast.error(t('createFailed'));
        return;
      }
      toast.success(t('createdToast'));
      setPlaintext(res.plaintext);
    });
  }

  function handleCopy() {
    if (!plaintext) return;
    void navigator.clipboard.writeText(plaintext);
    toast.success(t('copied'));
  }

  function handleClose(next: boolean) {
    if (!next) {
      setOpen(false);
      setPlaintext(null);
      setName('');
    } else {
      setOpen(true);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus className="h-4 w-4" />
          {t('create')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        {plaintext ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t('secretWarningTitle')}</DialogTitle>
              <DialogDescription>{t('secretWarningDescription')}</DialogDescription>
            </DialogHeader>
            <div className="rounded-md border bg-muted px-3 py-2 font-mono text-sm break-all">
              {plaintext}
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={handleCopy}>
                <Copy className="h-4 w-4" />
                {t('copy')}
              </Button>
              <Button type="button" onClick={() => handleClose(false)}>
                {t('savedKey')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t('createDialogTitle')}</DialogTitle>
              <DialogDescription>{t('createDialogSubtitle')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="key-name">{t('name')}</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                autoFocus
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                {tCommon('cancel')}
              </Button>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? tCommon('loading') : t('create')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
