'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CouponTypeSelect } from './CouponTypeSelect';
import { dollarsToCents } from '@/lib/money';
import {
  type CouponStatus,
  type CouponType,
  type CouponView,
  type CreateCouponInput,
  type UpdateCouponInput,
} from '@/lib/server-api';
import {
  createCouponAction,
  updateCouponAction,
} from '@/app/[locale]/(panel)/coupons/actions';

const STATUSES: CouponStatus[] = ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'EXHAUSTED'];

interface Props {
  mode: 'create' | 'edit';
  coupon?: CouponView;
}

function centsToNanoUnitsString(cents: number): string {
  return (BigInt(cents) * 1_000_000n).toString();
}

function percentToBpsString(pct: number): string {
  return Math.round(pct * 100).toString();
}

function dollarsToNanoUnits(dollars: number): string {
  return centsToNanoUnitsString(dollarsToCents(dollars));
}

export function CouponForm({ mode, coupon }: Props) {
  const t = useTranslations('admin.coupons');
  const tForm = useTranslations('admin.coupons.form');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (mode === 'edit' && coupon) {
    return (
      <EditForm
        coupon={coupon}
        pending={pending}
        startTransition={startTransition}
        t={t}
        tForm={tForm}
        tCommon={tCommon}
      />
    );
  }

  return (
    <CreateForm
      pending={pending}
      startTransition={startTransition}
      router={router}
      t={t}
      tForm={tForm}
      tCommon={tCommon}
    />
  );
}

function CreateForm({
  pending,
  startTransition,
  router,
  t,
  tForm,
  tCommon,
}: {
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  router: ReturnType<typeof useRouter>;
  t: ReturnType<typeof useTranslations>;
  tForm: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
}) {
  const [code, setCode] = useState('');
  const [type, setType] = useState<CouponType>('FIXED_AMOUNT');
  const [valueRaw, setValueRaw] = useState('');
  const [methodCode, setMethodCode] = useState('');
  const [bundleId, setBundleId] = useState('');
  const [minTopupRaw, setMinTopupRaw] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [maxUsesPerUser, setMaxUsesPerUser] = useState('1');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [status, setStatus] = useState<CouponStatus>('ACTIVE');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isPercent = type === 'DISCOUNT_METHOD_PERCENT' || type === 'DISCOUNT_TOPUP';
  const needsBundle = type === 'DISCOUNT_BUNDLE_AMOUNT';
  const needsMethod = type === 'DISCOUNT_METHOD_PERCENT';
  const showMinTopup = type === 'DISCOUNT_TOPUP';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      setError(tCommon('error'));
      return;
    }
    const valueNum = Number(valueRaw);
    if (!Number.isFinite(valueNum) || valueNum <= 0) {
      setError(tCommon('error'));
      return;
    }

    const valueStr = isPercent
      ? percentToBpsString(valueNum)
      : dollarsToNanoUnits(valueNum);

    const body: CreateCouponInput = {
      code: trimmedCode,
      type,
      value: valueStr,
      maxUsesPerUser: Number(maxUsesPerUser) || 1,
      status,
    };
    if (maxUses.trim() !== '') {
      const n = parseInt(maxUses, 10);
      if (Number.isFinite(n) && n > 0) body.maxUses = n;
    }
    if (validFrom) body.validFrom = new Date(validFrom).toISOString();
    if (validTo) body.validTo = new Date(validTo).toISOString();
    if (comment.trim()) body.comment = comment.trim();
    if (needsMethod && methodCode.trim()) body.methodCode = methodCode.trim();
    if (needsBundle && bundleId.trim()) body.bundleId = bundleId.trim();
    if (showMinTopup && minTopupRaw.trim() !== '') {
      const n = Number(minTopupRaw);
      if (Number.isFinite(n) && n > 0) body.minTopupUnits = dollarsToNanoUnits(n);
    }

    startTransition(async () => {
      const res = await createCouponAction(body);
      if (!res.ok) {
        toast.error(tForm('saveFailed'));
        setError(tForm('saveFailed'));
        return;
      }
      toast.success(tForm('saved'));
      router.push(`/coupons`);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={tForm('code')}>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={tForm('codePlaceholder')}
          className="font-mono uppercase"
        />
      </Field>

      <Field label={tForm('type')} hint={tForm('typeHint')}>
        <CouponTypeSelect value={type} onChange={setType} />
      </Field>

      <Field
        label={isPercent ? tForm('valuePercent') : tForm('valueAmount')}
        hint={isPercent ? tForm('valuePercentHint') : tForm('valueAmountHint')}
      >
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={valueRaw}
          onChange={(e) => setValueRaw(e.target.value)}
        />
      </Field>

      {needsMethod ? (
        <Field label={tForm('methodCode')} hint={tForm('methodCodeHint')}>
          <Input
            value={methodCode}
            onChange={(e) => setMethodCode(e.target.value)}
            placeholder={tForm('methodCodePlaceholder')}
            className="font-mono"
          />
        </Field>
      ) : null}

      {needsBundle ? (
        <Field label={tForm('bundleId')} hint={tForm('bundleIdHint')}>
          <Input
            value={bundleId}
            onChange={(e) => setBundleId(e.target.value)}
            placeholder="bundle_xxxxxxxxx"
            className="font-mono"
          />
        </Field>
      ) : null}

      {showMinTopup ? (
        <Field label={tForm('minTopupUnits')} hint={tForm('minTopupUnitsHint')}>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={minTopupRaw}
            onChange={(e) => setMinTopupRaw(e.target.value)}
          />
        </Field>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={tForm('maxUses')} hint={tForm('maxUsesHint')}>
          <Input
            type="number"
            min="1"
            step="1"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
          />
        </Field>
        <Field label={tForm('maxUsesPerUser')}>
          <Input
            type="number"
            min="1"
            step="1"
            value={maxUsesPerUser}
            onChange={(e) => setMaxUsesPerUser(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={tForm('validFrom')}>
          <Input
            type="datetime-local"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
          />
        </Field>
        <Field label={tForm('validTo')} hint={tForm('validToHint')}>
          <Input
            type="datetime-local"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
          />
        </Field>
      </div>

      <Field label={tForm('status')}>
        <Select value={status} onValueChange={(v) => setStatus(v as CouponStatus)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label={tForm('comment')}>
        <Textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={tForm('commentPlaceholder')}
        />
      </Field>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={pending}
        >
          {tCommon('cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {tCommon('create')}
        </Button>
      </div>
    </form>
  );
}

function EditForm({
  coupon,
  pending,
  startTransition,
  t,
  tForm,
  tCommon,
}: {
  coupon: CouponView;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  t: ReturnType<typeof useTranslations>;
  tForm: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
}) {
  const [status, setStatus] = useState<CouponStatus>(coupon.status);
  const [validTo, setValidTo] = useState(
    coupon.validTo ? toDatetimeLocal(coupon.validTo) : '',
  );
  const [maxUses, setMaxUses] = useState(coupon.maxUses != null ? String(coupon.maxUses) : '');
  const [comment, setComment] = useState(coupon.comment ?? '');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body: UpdateCouponInput = { status, comment: comment.trim() || null };
    body.validTo = validTo ? new Date(validTo).toISOString() : null;
    if (maxUses.trim() === '') {
      body.maxUses = null;
    } else {
      const n = parseInt(maxUses, 10);
      if (Number.isFinite(n) && n > 0) body.maxUses = n;
    }

    startTransition(async () => {
      const res = await updateCouponAction(coupon.id, body);
      if (!res.ok) toast.error(tForm('saveFailed'));
      else toast.success(tForm('saved'));
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={tForm('code')}>
        <Input value={coupon.code} disabled className="font-mono uppercase" />
      </Field>
      <Field label={tForm('type')}>
        <Input value={t(`type.${coupon.type}`)} disabled />
      </Field>
      <Field label={tForm('status')}>
        <Select value={status} onValueChange={(v) => setStatus(v as CouponStatus)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={tForm('validTo')} hint={tForm('validToHint')}>
        <Input
          type="datetime-local"
          value={validTo}
          onChange={(e) => setValidTo(e.target.value)}
        />
      </Field>
      <Field label={tForm('maxUses')} hint={tForm('maxUsesHint')}>
        <Input
          type="number"
          min="1"
          step="1"
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
        />
      </Field>
      <Field label={tForm('comment')}>
        <Textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={tForm('commentPlaceholder')}
        />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {tCommon('save')}
        </Button>
      </div>
    </form>
  );
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
