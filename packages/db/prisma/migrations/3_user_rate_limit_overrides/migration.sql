-- Per-user rate-limit overrides. Each column is nullable; NULL means
-- "use the env default" so existing users keep their current behaviour.

ALTER TABLE "user"
  ADD COLUMN "rateLimitPerMin"          INTEGER,
  ADD COLUMN "rateLimitPerDay"          INTEGER,
  ADD COLUMN "maxConcurrentTasks"       INTEGER,
  ADD COLUMN "maxRequestsPerDayPerUser" INTEGER;
