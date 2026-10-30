-- Staff access is invite-only. A confirmed email on the staff domain no longer grants admin by itself: an owner invites the
-- address from the Staff page, and the role (with the invited level) is granted when that invited account confirms its email.

CREATE TABLE IF NOT EXISTS public.staff_invites (
  email text PRIMARY KEY CHECK (email = lower(email) AND length(email) <= 254),
  level text NOT NULL DEFAULT 'viewer' CHECK (level IN ('owner','manager','support','billing','viewer')),
  invited_by uuid,
  invited_by_label text NOT NULL DEFAULT 'Staff',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at timestamptz
);
GRANT SELECT ON public.staff_invites TO authenticated;
GRANT ALL ON public.staff_invites TO service_role;
ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read invites" ON public.staff_invites;
CREATE POLICY "staff read invites" ON public.staff_invites FOR SELECT TO authenticated USING (public.has_perm(auth.uid(), 'staff'));
DO $$ DECLARE t text; BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "two-factor session" ON public.staff_invites';
  EXECUTE 'DROP POLICY IF EXISTS "active account" ON public.staff_invites';
  FOREACH t IN ARRAY ARRAY['staff_invites'] LOOP
    EXECUTE format('CREATE POLICY "two-factor session" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_session_ok()) WITH CHECK (public.mfa_session_ok())', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['staff_invites'] LOOP
    EXECUTE format('CREATE POLICY "active account" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.account_access_ok()) WITH CHECK (public.account_access_ok())', t);
  END LOOP;
END $$;

-- Replaces the domain rule: only an unexpired, unused invite for this exact address grants staff access.
CREATE OR REPLACE FUNCTION public.grant_admin_for_domain() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv staff_invites%ROWTYPE;
BEGIN
  IF new.email_confirmed_at IS NULL THEN RETURN new; END IF;
  SELECT * INTO inv FROM staff_invites WHERE email = lower(new.email) AND accepted_at IS NULL AND expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN new; END IF;
  INSERT INTO staff_members (user_id, level) VALUES (new.id, inv.level) ON CONFLICT (user_id) DO UPDATE SET level = excluded.level, updated_at = now();
  INSERT INTO user_roles (user_id, role) VALUES (new.id, 'admin') ON CONFLICT DO NOTHING;
  UPDATE staff_invites SET accepted_at = now() WHERE email = inv.email;
  RETURN new;
END $$;
REVOKE EXECUTE ON FUNCTION public.grant_admin_for_domain() FROM PUBLIC, anon, authenticated;
