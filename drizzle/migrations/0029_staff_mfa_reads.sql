-- When two-factor is required for staff (security_settings.require_staff_mfa), a staff account without an authenticator could
-- still read every client's personal data: the restrictive "two-factor session" policy (mfa_session_ok) only refused sessions
-- that had two-factor set up but hadn't entered the code. Now a staff account without an authenticator counts as unverified
-- too, so it reads nothing until it sets one up. Clients are unaffected (two-factor stays optional for them).
CREATE OR REPLACE FUNCTION public.mfa_session_ok() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    OR (NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = auth.uid() AND f.status = 'verified')
      AND NOT (EXISTS (SELECT 1 FROM security_settings s WHERE s.require_staff_mfa)
        AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'))) $$;
REVOKE EXECUTE ON FUNCTION public.mfa_session_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_session_ok() TO authenticated;

-- The staff list (names, emails, levels) stays visible to staff who haven't set up two-factor yet, so the admin can show the
-- "set up two-factor" banner and the Staff page where they set it up. A session with two-factor set up must still enter its code.
CREATE OR REPLACE FUNCTION public.staff_directory()
RETURNS TABLE(user_id uuid, email text, name text, level text, mfa_enabled boolean, created_at timestamp with time zone)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') OR NOT public.account_access_ok()
     OR (coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' AND EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = auth.uid() AND f.status = 'verified')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
    SELECT r.user_id, p.email, nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), coalesce(s.level, 'viewer'),
      EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = r.user_id AND f.status = 'verified'), coalesce(s.created_at, p.created_at)
    FROM user_roles r LEFT JOIN profiles p ON p.id = r.user_id LEFT JOIN staff_members s ON s.user_id = r.user_id
    WHERE r.role = 'admin' ORDER BY p.email;
END $function$;
REVOKE EXECUTE ON FUNCTION public.staff_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_directory() TO authenticated;
