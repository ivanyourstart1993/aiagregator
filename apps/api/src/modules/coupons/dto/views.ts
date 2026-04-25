import type { CouponStatus, CouponType, Currency } from '@aiagg/db';

export interface CouponView {
  id: string;
  code: string;
  type: CouponType;
  value: bigint;
  currency: Currency;
  methodCode: string | null;
  bundleId: string | null;
  minTopupUnits: bigint | null;
  maxUses: number | null;
  maxUsesPerUser: number;
  validFrom: Date;
  validTo: Date | null;
  status: CouponStatus;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CouponRedemptionView {
  id: string;
  couponId: string;
  userId: string;
  apiRequestId: string | null;
  depositId: string | null;
  amountUnits: bigint;
  meta: unknown;
  createdAt: Date;
  coupon?: { code: string; type: CouponType };
}

export interface CouponValidationResult {
  couponId: string;
  code: string;
  type: CouponType;
  value: bigint;
  currency: Currency;
  methodCode: string | null;
  bundleId: string | null;
  minTopupUnits: bigint | null;
  status: CouponStatus;
  validTo: Date | null;
}
