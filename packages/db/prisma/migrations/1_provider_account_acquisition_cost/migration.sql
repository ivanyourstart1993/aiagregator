-- Add acquisition cost (per-account ROI tracking)
ALTER TABLE "provider_account"
  ADD COLUMN "acquisitionCostUnits" BIGINT DEFAULT 0;
