-- Custom SQL migration file, put your code below! --
-- Tolerate providers (e.g. Neon) where pg_search is unavailable/deprecated.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_search;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_search extension unavailable, skipping: %', SQLERRM;
END $$;
