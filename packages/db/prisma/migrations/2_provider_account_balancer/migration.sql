-- Anti-ban balancer fields for ProviderAccount.
ALTER TABLE "provider_account"
  ADD COLUMN "lastUsedAt"      TIMESTAMP(3),
  ADD COLUMN "cooldownUntil"   TIMESTAMP(3),
  ADD COLUMN "warmupStartedAt" TIMESTAMP(3);

-- Backfill warmupStartedAt for existing accounts so they aren't treated as
-- "brand new" on next deploy. Use createdAt - 30 days (well past warmup).
UPDATE "provider_account"
SET "warmupStartedAt" = "createdAt" - INTERVAL '30 days'
WHERE "warmupStartedAt" IS NULL;

-- Selector helper indexes.
CREATE INDEX IF NOT EXISTS "provider_account_status_cooldownUntil_idx"
  ON "provider_account" ("status", "cooldownUntil");
CREATE INDEX IF NOT EXISTS "provider_account_lastUsedAt_idx"
  ON "provider_account" ("lastUsedAt");
