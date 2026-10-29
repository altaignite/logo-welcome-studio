DROP POLICY IF EXISTS "client open ticket" ON public.support_tickets;
CREATE POLICY "client open ticket" ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'open' AND assigned_to IS NULL AND closed_at IS NULL
    AND (subscription_id IS NULL OR EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.id = subscription_id AND s.user_id = auth.uid())));