
-- Manual constraints (preserved across schema regenerations)
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_available_units_nonneg" CHECK ("availableUnits" >= 0);
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_reserved_units_nonneg" CHECK ("reservedUnits" >= 0);
CREATE UNIQUE INDEX "tariff_only_one_default" ON "tariff"("isDefault") WHERE "isDefault" = TRUE;
CREATE UNIQUE INDEX "coupon_redemption_request_unique" ON "coupon_redemption"("couponId","userId","apiRequestId") WHERE "apiRequestId" IS NOT NULL;
CREATE UNIQUE INDEX "coupon_redemption_deposit_unique" ON "coupon_redemption"("couponId","userId","depositId") WHERE "depositId" IS NOT NULL;
CREATE UNIQUE INDEX "coupon_redemption_standalone_unique" ON "coupon_redemption"("couponId","userId") WHERE "apiRequestId" IS NULL AND "depositId" IS NULL;
