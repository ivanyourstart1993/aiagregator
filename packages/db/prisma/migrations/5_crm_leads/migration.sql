-- Stage 17 — CRM (Lead pipeline for outbound sales)

-- Enums --------------------------------------------------------------------
CREATE TYPE "LeadType" AS ENUM (
  'TELEGRAM_CHANNEL', 'MOBILE_APP_IOS', 'MOBILE_APP_ANDROID', 'WEBSITE', 'OTHER'
);

CREATE TYPE "LeadStatus" AS ENUM (
  'NEW', 'ENRICHED', 'READY', 'CONTACTED', 'REPLIED', 'IN_DIALOG',
  'DEMO', 'WON', 'LOST_NO_REPLY', 'LOST_REJECTED', 'BLOCKED'
);

CREATE TYPE "LeadSourceKind" AS ENUM (
  'ITUNES_SEARCH', 'PLAY_STORE_SEARCH', 'LYZEM_SEARCH', 'TGSTAT_SEARCH',
  'TELEGRAM_MENTIONS', 'FACEBOOK_AD_LIBRARY', 'MANUAL'
);

CREATE TYPE "OutreachAccountStatus" AS ENUM (
  'WARMING', 'ACTIVE', 'PAUSED', 'BLOCKED'
);

CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

CREATE TYPE "MessageAuthor" AS ENUM ('LEAD', 'CLAUDE', 'HUMAN', 'SYSTEM');

-- LeadSource ---------------------------------------------------------------
CREATE TABLE "lead_source" (
  "id"              TEXT PRIMARY KEY,
  "kind"            "LeadSourceKind" NOT NULL,
  "name"            TEXT NOT NULL,
  "config"          JSONB NOT NULL,
  "enabled"         BOOLEAN NOT NULL DEFAULT TRUE,
  "intervalMinutes" INTEGER,
  "lastRunAt"       TIMESTAMP(3),
  "lastRunStatus"   TEXT,
  "lastRunError"    TEXT,
  "lastRunFound"    INTEGER,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL
);

CREATE INDEX "lead_source_kind_enabled_idx" ON "lead_source" ("kind", "enabled");
CREATE INDEX "lead_source_enabled_intervalMinutes_idx"
  ON "lead_source" ("enabled", "intervalMinutes");

-- Lead ---------------------------------------------------------------------
CREATE TABLE "lead" (
  "id"               TEXT PRIMARY KEY,
  "type"             "LeadType" NOT NULL,
  "externalId"       TEXT NOT NULL,
  "sourceKind"       "LeadSourceKind" NOT NULL,
  "sourceId"         TEXT,
  "name"             TEXT NOT NULL,
  "url"              TEXT,
  "telegramUsername" TEXT,
  "ownerEmail"       TEXT,
  "ownerName"        TEXT,
  "ownerWebsite"     TEXT,
  "metadata"         JSONB,
  "score"            INTEGER NOT NULL DEFAULT 0,
  "status"           "LeadStatus" NOT NULL DEFAULT 'NEW',
  "statusChangedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedToId"     TEXT,
  "draftMessage"     TEXT,
  "closeReason"      TEXT,
  "nextActionAt"     TIMESTAMP(3),
  "contactedAt"      TIMESTAMP(3),
  "firstReplyAt"     TIMESTAMP(3),
  "wonAt"            TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "lead_sourceId_fkey" FOREIGN KEY ("sourceId")
    REFERENCES "lead_source"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "lead_sourceKind_externalId_key"
  ON "lead" ("sourceKind", "externalId");
CREATE INDEX "lead_status_statusChangedAt_idx"
  ON "lead" ("status", "statusChangedAt");
CREATE INDEX "lead_type_status_idx" ON "lead" ("type", "status");
CREATE INDEX "lead_assignedToId_status_idx" ON "lead" ("assignedToId", "status");
CREATE INDEX "lead_score_idx" ON "lead" ("score");
CREATE INDEX "lead_nextActionAt_status_idx" ON "lead" ("nextActionAt", "status");

-- LeadStatusEvent ----------------------------------------------------------
CREATE TABLE "lead_status_event" (
  "id"             TEXT PRIMARY KEY,
  "leadId"         TEXT NOT NULL,
  "fromStatus"     "LeadStatus",
  "toStatus"       "LeadStatus" NOT NULL,
  "changedById"    TEXT,
  "changedBySystem" TEXT,
  "reason"         TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "lead_status_event_leadId_fkey" FOREIGN KEY ("leadId")
    REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "lead_status_event_leadId_createdAt_idx"
  ON "lead_status_event" ("leadId", "createdAt");

-- LeadNote -----------------------------------------------------------------
CREATE TABLE "lead_note" (
  "id"        TEXT PRIMARY KEY,
  "leadId"    TEXT NOT NULL,
  "authorId"  TEXT,
  "body"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "lead_note_leadId_fkey" FOREIGN KEY ("leadId")
    REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "lead_note_leadId_createdAt_idx"
  ON "lead_note" ("leadId", "createdAt");

-- OutreachAccount ----------------------------------------------------------
CREATE TABLE "outreach_account" (
  "id"              TEXT PRIMARY KEY,
  "name"            TEXT NOT NULL,
  "phone"           TEXT NOT NULL UNIQUE,
  "sessionString"   TEXT,
  "apiCredentials"  JSONB NOT NULL,
  "proxyId"         TEXT,
  "status"          "OutreachAccountStatus" NOT NULL DEFAULT 'WARMING',
  "dailyLimit"      INTEGER NOT NULL DEFAULT 20,
  "todaySent"       INTEGER NOT NULL DEFAULT 0,
  "countersResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "warmupStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "totalSent"       INTEGER NOT NULL DEFAULT 0,
  "lastSentAt"      TIMESTAMP(3),
  "lastErrorAt"     TIMESTAMP(3),
  "lastErrorMessage" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL
);

CREATE INDEX "outreach_account_status_idx" ON "outreach_account" ("status");

-- Conversation -------------------------------------------------------------
CREATE TABLE "conversation" (
  "id"               TEXT PRIMARY KEY,
  "leadId"           TEXT NOT NULL UNIQUE,
  "outreachAccountId" TEXT,
  "lastMessageAt"    TIMESTAMP(3),
  "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "externalChatId"   TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "conversation_leadId_fkey" FOREIGN KEY ("leadId")
    REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversation_outreachAccountId_fkey" FOREIGN KEY ("outreachAccountId")
    REFERENCES "outreach_account"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "conversation_lastMessageAt_idx"
  ON "conversation" ("lastMessageAt");

-- Message ------------------------------------------------------------------
CREATE TABLE "message" (
  "id"                TEXT PRIMARY KEY,
  "conversationId"    TEXT NOT NULL,
  "direction"         "MessageDirection" NOT NULL,
  "author"            "MessageAuthor" NOT NULL,
  "authorUserId"      TEXT,
  "body"              TEXT NOT NULL,
  "claudeConfidence"  DECIMAL(3, 2),
  "delivered"         BOOLEAN NOT NULL DEFAULT FALSE,
  "deliveryError"     TEXT,
  "externalMessageId" TEXT,
  "sentAt"            TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "message_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "message_conversationId_createdAt_idx"
  ON "message" ("conversationId", "createdAt");
CREATE INDEX "message_direction_delivered_idx"
  ON "message" ("direction", "delivered");

-- OutreachTemplate ---------------------------------------------------------
CREATE TABLE "outreach_template" (
  "id"          TEXT PRIMARY KEY,
  "slug"        TEXT NOT NULL UNIQUE,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "body"        TEXT NOT NULL,
  "targetTypes" "LeadType"[] NOT NULL DEFAULT '{}',
  "enabled"     BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);
