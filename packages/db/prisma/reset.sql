-- DANGER: this script can drop the entire `public` schema if explicitly enabled.
-- It exists for LOCAL development only (reset a dirty dev DB to baseline
-- before re-running migrations from scratch).
--
-- ⚠️  Production safety:
--     The Northflank `db-migrations` job MUST NOT wipe the DB on every run.
--     This file is intentionally a no-op by default so that legacy job
--     configs that pipe `reset.sql | psql && prisma migrate deploy`
--     keep working but stop destroying data.
--
-- To actually reset (local dev only) — set the GUC `aiagg.allow_reset=true`
-- before running this script:
--
--     PGOPTIONS="-c aiagg.allow_reset=true" psql $DATABASE_URL -f reset.sql
--
-- Or via psql variable: psql -v ON_ERROR_STOP=1 -c "SET aiagg.allow_reset = 'true'" -f reset.sql

DO $$
DECLARE
  allow text;
BEGIN
  BEGIN
    allow := current_setting('aiagg.allow_reset', true);
  EXCEPTION WHEN others THEN
    allow := NULL;
  END;
  IF allow IS DISTINCT FROM 'true' THEN
    RAISE NOTICE 'reset.sql skipped: aiagg.allow_reset != true (production-safe default)';
    RETURN;
  END IF;
  -- Explicit consent — actually wipe.
  EXECUTE 'DROP SCHEMA IF EXISTS public CASCADE';
  EXECUTE 'CREATE SCHEMA public';
  EXECUTE 'GRANT ALL ON SCHEMA public TO PUBLIC';
  RAISE NOTICE 'reset.sql: public schema dropped and recreated';
END $$;
