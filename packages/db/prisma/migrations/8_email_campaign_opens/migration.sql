-- Add totalOpened counter to email_campaign.
-- Backfilled from existing EmailDelivery.openedAt rows so opens already
-- reported by Resend (before this column existed) are surfaced in the UI.

ALTER TABLE "email_campaign"
  ADD COLUMN "totalOpened" INTEGER NOT NULL DEFAULT 0;

UPDATE "email_campaign" c
SET "totalOpened" = sub.cnt
FROM (
  SELECT "campaignId", COUNT(*) AS cnt
  FROM "email_delivery"
  WHERE "campaignId" IS NOT NULL AND "openedAt" IS NOT NULL
  GROUP BY "campaignId"
) sub
WHERE c.id = sub."campaignId";
