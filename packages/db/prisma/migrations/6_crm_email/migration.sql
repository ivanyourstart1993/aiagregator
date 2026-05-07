-- Stage 18 — CRM Email outreach (Resend send + inbound)

CREATE TYPE "EmailCampaignStatus" AS ENUM (
  'DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED'
);

CREATE TYPE "EmailDeliveryStatus" AS ENUM (
  'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'BOUNCED',
  'COMPLAINED', 'REPLIED', 'FAILED', 'SKIPPED'
);

CREATE TYPE "EmailSuppressionReason" AS ENUM (
  'BOUNCE', 'COMPLAINT', 'UNSUBSCRIBE', 'MANUAL'
);

CREATE TABLE "email_campaign" (
  "id"             TEXT PRIMARY KEY,
  "name"           TEXT NOT NULL,
  "description"    TEXT,
  "templateSlug"   TEXT NOT NULL,
  "subject"        TEXT NOT NULL,
  "audienceFilter" JSONB NOT NULL,
  "hourlyCap"      INTEGER NOT NULL DEFAULT 20,
  "status"         "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "totalAudience"  INTEGER NOT NULL DEFAULT 0,
  "totalSent"      INTEGER NOT NULL DEFAULT 0,
  "totalDelivered" INTEGER NOT NULL DEFAULT 0,
  "totalBounced"   INTEGER NOT NULL DEFAULT 0,
  "totalReplied"   INTEGER NOT NULL DEFAULT 0,
  "totalComplained" INTEGER NOT NULL DEFAULT 0,
  "startedAt"      TIMESTAMP(3),
  "finishedAt"     TIMESTAMP(3),
  "createdById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL
);

CREATE INDEX "email_campaign_status_createdAt_idx"
  ON "email_campaign" ("status", "createdAt");

CREATE TABLE "email_delivery" (
  "id"               TEXT PRIMARY KEY,
  "campaignId"       TEXT,
  "leadId"           TEXT NOT NULL,
  "toEmail"          TEXT NOT NULL,
  "subject"          TEXT NOT NULL,
  "resendId"         TEXT UNIQUE,
  "status"           "EmailDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
  "errorMessage"     TEXT,
  "sentAt"           TIMESTAMP(3),
  "deliveredAt"      TIMESTAMP(3),
  "openedAt"         TIMESTAMP(3),
  "bouncedAt"        TIMESTAMP(3),
  "complainedAt"     TIMESTAMP(3),
  "repliedAt"        TIMESTAMP(3),
  "unsubscribeToken" TEXT NOT NULL UNIQUE,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "email_delivery_campaignId_fkey" FOREIGN KEY ("campaignId")
    REFERENCES "email_campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "email_delivery_leadId_createdAt_idx"
  ON "email_delivery" ("leadId", "createdAt");
CREATE INDEX "email_delivery_campaignId_status_idx"
  ON "email_delivery" ("campaignId", "status");
CREATE INDEX "email_delivery_status_createdAt_idx"
  ON "email_delivery" ("status", "createdAt");

CREATE TABLE "email_suppression" (
  "id"        TEXT PRIMARY KEY,
  "email"     TEXT NOT NULL UNIQUE,
  "reason"    "EmailSuppressionReason" NOT NULL,
  "notes"     TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "email_suppression_email_idx" ON "email_suppression" ("email");
