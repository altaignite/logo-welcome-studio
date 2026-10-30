-- Security log for owners: what the server blocked or flagged, grouped so an attack adds one row per kind, source and hour
-- instead of one row per request (logging every hit would amplify the attack). Written only by server code.

CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (length(kind) <= 60),
  severity text NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  dedupe text UNIQUE,
  ip text CHECK (ip IS NULL OR length(ip) <= 64),
  country text CHECK (country IS NULL OR length(country) <= 8),
  user_id uuid,
  path text CHECK (path IS NULL OR length(path) <= 300),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  count int NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by_label text
);
CREATE INDEX IF NOT EXISTS security_events_last_seen_idx ON public.security_events (last_seen DESC);
CREATE INDEX IF NOT EXISTS security_events_open_idx ON public.security_events (severity) WHERE resolved_at IS NULL;
GRANT SELECT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owners read security events" ON public.security_events;
CREATE POLICY "owners read security events" ON public.security_events FOR SELECT TO authenticated USING (public.has_perm(auth.uid(), 'staff'));
DO $$ DECLARE t text; BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "two-factor session" ON public.security_events';
  EXECUTE 'DROP POLICY IF EXISTS "active account" ON public.security_events';
  FOREACH t IN ARRAY ARRAY['security_events'] LOOP
    EXECUTE format('CREATE POLICY "two-factor session" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_session_ok()) WITH CHECK (public.mfa_session_ok())', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['security_events'] LOOP
    EXECUTE format('CREATE POLICY "active account" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.account_access_ok()) WITH CHECK (public.account_access_ok())', t);
  END LOOP;
END $$;
REVOKE ALL ON public.security_events FROM anon;

-- Records an event, or bumps the count of the matching open group. High and critical events alert owners once per group.
CREATE OR REPLACE FUNCTION public.log_security_event(_kind text, _severity text, _dedupe text, _ip text, _country text, _user uuid, _path text, _detail jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fresh boolean;
BEGIN
  INSERT INTO security_events (kind, severity, dedupe, ip, country, user_id, path, detail)
  VALUES (left(_kind, 60), _severity, left(_dedupe, 300), left(_ip, 64), left(_country, 8), _user, left(_path, 300), coalesce(_detail, '{}'::jsonb))
  ON CONFLICT (dedupe) DO UPDATE SET count = security_events.count + 1, last_seen = now(), resolved_at = NULL, resolved_by_label = NULL
  RETURNING (xmax = 0) INTO fresh;
  IF fresh AND _severity IN ('high', 'critical') THEN
    PERFORM notify_staff('staff', NULL, 'security', 'Security alert: ' || replace(_kind, '_', ' '), coalesce(_detail->>'summary', _path), '/admin/security', 'sec:' || coalesce(_dedupe, gen_random_uuid()::text));
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_security_event(text, text, text, text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_event(text, text, text, text, text, uuid, text, jsonb) TO service_role;

-- KYC restrictions appear in the security log too.
CREATE OR REPLACE FUNCTION public.log_kyc_flag() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'fraud_kyc' AND OLD.status IS DISTINCT FROM 'fraud_kyc' THEN
    PERFORM public.log_security_event('account_restricted_kyc', 'high', 'kyc:' || NEW.id, NULL, NULL, NEW.id, '/admin/accounts/' || NEW.id,
      jsonb_build_object('summary', coalesce(NEW.status_reason, 'Account restricted for KYC review'), 'account', NEW.account_number));
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS profiles_log_kyc ON public.profiles;
CREATE TRIGGER profiles_log_kyc AFTER UPDATE OF status ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.log_kyc_flag();
