-- Every cancellation, upgrade, downgrade and account closure is a signed application with the client's reasons, actioned at once
-- and kept for staff review. Written only by server functions; clients read their own, staff with account access read all.
CREATE TABLE IF NOT EXISTS public.account_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  subscription_id uuid REFERENCES public.subscriptions(id),
  kind text NOT NULL CHECK (kind IN ('cancel','upgrade','downgrade','close_account')),
  from_plan text,
  to_plan text,
  reason text NOT NULL CHECK (length(reason) BETWEEN 2 AND 80),
  details text CHECK (details IS NULL OR length(details) <= 3000),
  feedback jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_at timestamptz,
  status text NOT NULL DEFAULT 'actioned' CHECK (status IN ('actioned','reviewed')),
  signed_at timestamptz NOT NULL,
  actor_label text NOT NULL DEFAULT 'Client',
  reviewed_at timestamptz,
  reviewed_by_label text,
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_change_requests_user_idx ON public.account_change_requests (user_id, created_at DESC);
GRANT SELECT ON public.account_change_requests TO authenticated;
GRANT ALL ON public.account_change_requests TO service_role;
REVOKE ALL ON public.account_change_requests FROM anon;
ALTER TABLE public.account_change_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client read own changes" ON public.account_change_requests;
CREATE POLICY "client read own changes" ON public.account_change_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DO $$ DECLARE t text; BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "two-factor session" ON public.account_change_requests';
  EXECUTE 'DROP POLICY IF EXISTS "active account" ON public.account_change_requests';
  FOREACH t IN ARRAY ARRAY['account_change_requests'] LOOP
    EXECUTE format('CREATE POLICY "two-factor session" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_session_ok()) WITH CHECK (public.mfa_session_ok())', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['account_change_requests'] LOOP
    EXECUTE format('CREATE POLICY "active account" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.account_access_ok()) WITH CHECK (public.account_access_ok())', t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS audit_account_change_requests ON public.account_change_requests;
CREATE TRIGGER audit_account_change_requests AFTER INSERT OR UPDATE ON public.account_change_requests FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- Staff are told about every change so they can review it.
CREATE OR REPLACE FUNCTION public.notify_account_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE who text;
BEGIN
  SELECT coalesce(nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), ''), email) INTO who FROM profiles WHERE id = NEW.user_id;
  PERFORM notify_staff('accounts', NULL, 'account_change',
    CASE NEW.kind WHEN 'cancel' THEN 'Plan cancellation' WHEN 'upgrade' THEN 'Plan upgrade' WHEN 'downgrade' THEN 'Plan downgrade' ELSE 'Account closure' END || ': ' || coalesce(who, 'a client'),
    'Reason: ' || NEW.reason, '/admin/records/account_change_requests/' || NEW.id, 'change:' || NEW.id);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS account_change_notify ON public.account_change_requests;
CREATE TRIGGER account_change_notify AFTER INSERT ON public.account_change_requests FOR EACH ROW EXECUTE FUNCTION public.notify_account_change();
