CREATE POLICY "admin insert apps" ON public.applications FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT INSERT ON public.applications TO authenticated;