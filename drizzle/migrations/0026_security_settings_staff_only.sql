-- security_settings holds staff-only configuration (whether staff must use two-factor). It was readable by every signed-in
-- user (USING (true)); only staff read it now. mfa_satisfied() is SECURITY DEFINER, so the two-factor check keeps working for everyone.
DROP POLICY IF EXISTS "signed in read security settings" ON public.security_settings;
DROP POLICY IF EXISTS "staff read security settings" ON public.security_settings;
CREATE POLICY "staff read security settings" ON public.security_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
