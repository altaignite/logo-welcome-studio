ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'suspended';

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS first_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS guarantee_void_reason text,
  ADD COLUMN IF NOT EXISTS overage_billed_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_warning text;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS hosted_url text,
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'service',
  ADD COLUMN IF NOT EXISTS collection_stage text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS interest_accrued numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fees_accrued numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS collection_notes text;

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS stripe_id text UNIQUE;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS estimated_hours numeric,
  ADD COLUMN IF NOT EXISTS over_allowance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overage_approved boolean NOT NULL DEFAULT false;

ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks(id);

-- Ledger of interest, legal, court and overage charges.
CREATE TABLE public.invoice_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  invoice_id uuid REFERENCES public.invoices(id),
  subscription_id uuid REFERENCES public.subscriptions(id),
  kind text NOT NULL CHECK (kind IN ('interest','legal_fee','court_fee','overage')),
  description text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  stripe_item_id text,
  billed_invoice_id text,
  actor_label text NOT NULL DEFAULT 'System',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.invoice_charges TO authenticated;
GRANT ALL ON public.invoice_charges TO service_role;
ALTER TABLE public.invoice_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or admin read charges" ON public.invoice_charges FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER audit_invoice_charges AFTER INSERT OR UPDATE OR DELETE ON public.invoice_charges FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- Single row of editable billing rules.
CREATE TABLE public.billing_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  overage_rates jsonb NOT NULL DEFAULT '{"Starter":60,"Growth":55,"Scale":50}',
  overage_needs_approval boolean NOT NULL DEFAULT true,
  monthly_interest_pct numeric NOT NULL DEFAULT 5,
  legal_after_days int NOT NULL DEFAULT 90,
  legal_fee_pct numeric NOT NULL DEFAULT 15,
  legal_fee_min numeric NOT NULL DEFAULT 40,
  court_fees jsonb NOT NULL DEFAULT '[{"name":"Court filing fee","amount":350},{"name":"Summons service","amount":95},{"name":"Hearing fee","amount":150}]',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.billing_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT, UPDATE ON public.billing_settings TO authenticated;
GRANT ALL ON public.billing_settings TO service_role;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed in read billing rules" ON public.billing_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin update billing rules" ON public.billing_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Stripe webhook idempotency.
CREATE TABLE public.stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.stripe_events TO service_role;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- Clients: read their own tasks and audit-free client view; open tickets; reply only while a ticket is not closed.
CREATE POLICY "client read own tasks" ON public.tasks FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "client open ticket" ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'open' AND assigned_to IS NULL);
GRANT INSERT ON public.support_tickets TO authenticated;
CREATE POLICY "client reply open ticket" ON public.ticket_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND actor_id = auth.uid() AND internal = false
    AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid() AND t.status <> 'closed'));
GRANT INSERT ON public.ticket_messages TO authenticated;

-- Closed tickets can never be reopened or replied to by clients (defence in depth beyond RLS).
CREATE OR REPLACE FUNCTION public.guard_closed_ticket() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM support_tickets WHERE id = NEW.ticket_id AND status = 'closed') THEN
    RAISE EXCEPTION 'This ticket is closed and can no longer be replied to.';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_closed_ticket() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER ticket_closed_guard BEFORE INSERT ON public.ticket_messages FOR EACH ROW EXECUTE FUNCTION public.guard_closed_ticket();

-- Logged hours past the plan allowance flag the task as over allowance.
CREATE OR REPLACE FUNCTION public.apply_time_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sub uuid; used numeric; cap numeric;
BEGIN
  UPDATE public.projects SET hours = hours + NEW.hours WHERE id = NEW.project_id RETURNING subscription_id INTO sub;
  IF sub IS NOT NULL THEN
    UPDATE public.subscriptions SET hours_used = hours_used + NEW.hours WHERE id = sub RETURNING hours_used, monthly_hours INTO used, cap;
  ELSE
    UPDATE public.subscriptions SET hours_used = hours_used + NEW.hours WHERE user_id = NEW.user_id AND status = 'active' RETURNING hours_used, monthly_hours INTO used, cap;
  END IF;
  IF NEW.task_id IS NOT NULL AND used IS NOT NULL AND used > cap THEN
    UPDATE public.tasks SET over_allowance = true WHERE id = NEW.task_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_time_entry() FROM PUBLIC, anon, authenticated;