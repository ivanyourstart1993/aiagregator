'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from '@/i18n/navigation';
import { applyCouponAction } from '@/app/[locale]/(dashboard)/coupons/actions';

const KNOWN_ERROR_CODES = new Set([
  'coupon_invalid',
  'coupon_expired',
  'coupon_already_used',
  'coupon_not_applicable',
  'coupon_min_topup_not_met',
]);

export function ApplyCouponForm() {
  const t = useTranslations('coupons');
  const tErrors = useTranslations('coupons.errors');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    startTransition(async () => {
      const res = await applyCouponAction(trimmed);
      if (!res.ok) {
        const code = res.code ?? 'internal_error';
        const key = KNOWN_ERROR_CODES.has(code) ? code : 'internal_error';
        const msg = tErrors(key);
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success(t('appliedToast'));
      setCode('');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="coupon-code">{t('codeLabel')}</Label>
        <div className="flex gap-2">
          <Input
            id="coupon-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t('codePlaceholder')}
            autoComplete="off"
            spellCheck={false}
            className="font-mono uppercase"
          />
          <Button type="submit" disabled={pending || code.trim().length === 0}>
            <Ticket className="h-4 w-4" />
            {pending ? t('applying') : t('applyCta')}
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}
