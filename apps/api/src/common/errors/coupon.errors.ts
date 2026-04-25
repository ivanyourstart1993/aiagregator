/**
 * Domain-level coupon exceptions. Translated to public errors by `PublicErrorFilter`.
 */

export class CouponInvalidError extends Error {
  constructor(
    public readonly code: string,
    public readonly reason: string = 'invalid',
  ) {
    super(`Coupon ${code} is invalid: ${reason}`);
    this.name = 'CouponInvalidError';
  }
}

export class CouponExpiredError extends Error {
  constructor(public readonly code: string) {
    super(`Coupon ${code} is expired`);
    this.name = 'CouponExpiredError';
  }
}

export class CouponAlreadyUsedError extends Error {
  constructor(public readonly code: string) {
    super(`Coupon ${code} has already been used by this user`);
    this.name = 'CouponAlreadyUsedError';
  }
}

export class CouponNotApplicableError extends Error {
  constructor(
    public readonly code: string,
    public readonly reason: string,
  ) {
    super(`Coupon ${code} is not applicable: ${reason}`);
    this.name = 'CouponNotApplicableError';
  }
}
