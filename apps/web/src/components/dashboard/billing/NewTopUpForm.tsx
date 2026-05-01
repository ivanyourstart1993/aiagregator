'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRouter } from '@/i18n/navigation';
import { createInvoiceAction } from '@/app/[locale]/(dashboard)/top-up/actions';
import { validateCouponAction } from '@/app/[locale]/(dashboard)/coupons/actions';
import { formatNanoToUSD } from '@/lib/money';

const schema = z.object({
  amountUsd: z
    .number({ invalid_type_error: 'amountInvalid' })
    .min(5, 'amountInvalid')
    .max(10000, 'amountInvalid'),
  provider: z.literal('cryptomus'),
});

type FormValues = z.infer<typeof schema>;

const KNOWN_COUPON_ERRORS = new Set([
  'coupon_invalid',
  'coupon_expired',
  'coupon_already_used',
  'coupon_not_applicable',
  'coupon_min_topup_not_met',
]);

export function NewTopUpForm() {
  const t = useTranslations('topup');
  const tCommon = useTranslations('common');
  const tCoupon = useTranslations('coupons.errors');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [validating, startValidating] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponPreview, setCouponPreview] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { amountUsd: 25, provider: 'cryptomus' },
  });

  const provider = watch('provider');

  function onValidateCoupon() {
    const code = couponCode.trim().toUpperCase();
    setCouponPreview(null);
    setCouponError(null);
    if (!code) return;
    startValidating(async () => {
      const res = await validateCouponAction(code);
      if (!res.ok) {
        const codeKey = res.code ?? 'internal_error';
        const key = KNOWN_COUPON_ERRORS.has(codeKey) ? codeKey : 'internal_error';
        setCouponError(tCoupon(key));
        return;
      }
      if (res.type !== 'DISCOUNT_TOPUP' && res.type !== 'BONUS_MONEY') {
        setCouponError(t('couponNotApplicable'));
        return;
      }
      if (res.previewBonusUnits) {
        setCouponPreview(
          t('couponValid', { amount: formatNanoToUSD(res.previewBonusUnits) }),
        );
      } else {
        setCouponPreview(t('couponValidGeneric'));
      }
    });
  }

  function onSubmit(values: FormValues) {
    setServerError(null);
    startTransition(async () => {
      const code = couponCode.trim().toUpperCase() || undefined;
      const res = await createInvoiceAction({ amountUsd: values.amountUsd, couponCode: code });
      if (!res.ok || !res.depositId) {
        const msg = t('createFailed');
        setServerError(msg);
        toast.error(msg);
        return;
      }
      toast.success(tCommon('success'));
      router.push(`/top-up/${res.depositId}`);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-md">
      <div className="space-y-2">
        <Label htmlFor="amount">{t('amount')}</Label>
        <Input
          id="amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="5"
          max="10000"
          placeholder={t('amountPlaceholder')}
          {...register('amountUsd', { valueAsNumber: true })}
        />
        {errors.amountUsd ? (
          <p className="text-xs text-destructive">{t('amountInvalid')}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('amountHint')}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="provider">{t('provider')}</Label>
        <Select
          value={provider}
          onValueChange={(v) => setValue('provider', v as 'cryptomus')}
        >
          <SelectTrigger id="provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cryptomus">{t('providerCryptomus')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="coupon">{t('couponLabel')}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="coupon"
            value={couponCode}
            onChange={(e) => {
              setCouponCode(e.target.value.toUpperCase());
              setCouponPreview(null);
              setCouponError(null);
            }}
            placeholder={t('couponPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            className="font-mono uppercase"
          />
          <Button
            type="button"
            variant="outline"
            disabled={validating || couponCode.trim().length === 0}
            onClick={onValidateCoupon}
          >
            {validating ? t('couponValidating') : t('couponValidate')}
          </Button>
        </div>
        {couponPreview ? <p className="text-xs text-emerald-600">{couponPreview}</p> : null}
        {couponError ? <p className="text-xs text-destructive">{couponError}</p> : null}
        {!couponPreview && !couponError ? (
          <p className="text-xs text-muted-foreground">{t('couponHint')}</p>
        ) : null}
      </div>

      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? t('creating') : t('createInvoice')}
      </Button>
    </form>
  );
}
