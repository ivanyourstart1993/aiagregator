'use client';

import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CouponType } from '@/lib/server-api';

const TYPES: CouponType[] = [
  'FIXED_AMOUNT',
  'BONUS_MONEY',
  'DISCOUNT_METHOD_PERCENT',
  'DISCOUNT_BUNDLE_AMOUNT',
  'DISCOUNT_TOPUP',
];

interface Props {
  value: CouponType;
  onChange: (v: CouponType) => void;
  disabled?: boolean;
  id?: string;
}

export function CouponTypeSelect({ value, onChange, disabled, id }: Props) {
  const t = useTranslations('admin.coupons.type');
  return (
    <Select value={value} onValueChange={(v) => onChange(v as CouponType)} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TYPES.map((type) => (
          <SelectItem key={type} value={type}>
            {t(type)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
