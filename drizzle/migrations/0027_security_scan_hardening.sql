-- Deep security scan fixes.
-- 1. SECURITY DEFINER functions skip RLS, so the restrictive two-factor and active-account policies don't protect them: the
--    staff-only ones now require a two-factor-verified staff session (has_perm checks mfa_satisfied) and the right staff level.
CREATE OR REPLACE FUNCTION public.user_sessions(_user uuid) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT (public.has_perm(auth.uid(), 'accounts') OR public.has_perm(auth.uid(), 'staff')) OR NOT public.mfa_session_ok() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT to_jsonb(s) FROM auth.sessions s WHERE s.user_id = _user ORDER BY s.created_at DESC LIMIT 100;
END $function$;
REVOKE EXECUTE ON FUNCTION public.user_sessions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_sessions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_directory()
RETURNS TABLE(user_id uuid, email text, name text, level text, mfa_enabled boolean, created_at timestamp with time zone)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') OR NOT public.mfa_session_ok() OR NOT public.account_access_ok() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
    SELECT r.user_id, p.email, nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), coalesce(s.level, 'viewer'),
      EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = r.user_id AND f.status = 'verified'), coalesce(s.created_at, p.created_at)
    FROM user_roles r LEFT JOIN profiles p ON p.id = r.user_id LEFT JOIN staff_members s ON s.user_id = r.user_id
    WHERE r.role = 'admin' ORDER BY p.email;
END $function$;
REVOKE EXECUTE ON FUNCTION public.staff_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_directory() TO authenticated;

-- 2. Only server code (service role) asks whether a domain is blocked; signed-out visitors and clients could probe the list.
REVOKE EXECUTE ON FUNCTION public.email_domain_blocked(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_domain_blocked(text) TO service_role;

-- 3. Trigger functions are never called directly.
REVOKE EXECUTE ON FUNCTION public.log_kyc_flag() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_account_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_duplicate_phone() FROM PUBLIC, anon, authenticated;

-- 4. Internal tables are service-role only. RLS with no policies already refused clients; the grants go too.
REVOKE ALL ON public.stripe_events, public.job_runs, public.rate_limit_hits, public.app_secrets FROM anon, authenticated;
