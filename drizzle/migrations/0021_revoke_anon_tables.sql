-- Defence in depth: signed-out visitors never read or write tables directly (signup goes through Supabase Auth and the
-- database triggers). Row level security already denies them, but the default grants included TRUNCATE, which RLS does not
-- cover. Remove every table and sequence privilege from anon, now and for tables created later.
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
-- Signed-in users can't empty tables either; only the service role (server code) manages data in bulk.
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM authenticated', t);
  END LOOP;
END $$;
