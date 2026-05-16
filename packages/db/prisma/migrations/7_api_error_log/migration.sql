-- ApiErrorLog — 5xx capture from PublicErrorFilter for admin diagnostics.
-- See packages/db/prisma/schema.prisma for column intent and sanitisation
-- contract on requestBodyPreview.

CREATE TABLE "api_error_log" (
  "id"                 TEXT PRIMARY KEY,
  "userId"             TEXT,
  "apiKeyId"           TEXT,
  "requestId"          TEXT,
  "httpMethod"         TEXT NOT NULL,
  "url"                TEXT NOT NULL,
  "statusCode"         INTEGER NOT NULL,
  "errorCode"          TEXT,
  "errorMessage"       TEXT,
  "errorStack"         TEXT,
  "requestBodyPreview" JSONB,
  "ipAddress"          TEXT,
  "userAgent"          TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "api_error_log_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "api_error_log_userId_createdAt_idx"
  ON "api_error_log" ("userId", "createdAt");

CREATE INDEX "api_error_log_createdAt_idx"
  ON "api_error_log" ("createdAt");

CREATE INDEX "api_error_log_statusCode_createdAt_idx"
  ON "api_error_log" ("statusCode", "createdAt");
