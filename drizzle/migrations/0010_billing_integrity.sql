-- Financial records are retained: staff may create and update subscriptions and projects but never delete them.
DROP POLICY IF EXISTS "admin write" ON public.subscriptions;
CREATE POLICY "admin insert subscriptions" ON public.subscriptions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update subscriptions" ON public.subscriptions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admin write" ON public.projects;
CREATE POLICY "admin insert projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update projects" ON public.projects FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE DELETE ON public.profiles, public.applications, public.application_events, public.subscriptions, public.projects, public.invoices, public.transactions FROM authenticated;

-- Stripe-mirrored fields change only through server workflows (service role, no auth.uid()), never from a staff session.
CREATE OR REPLACE FUNCTION public.guard_billing_columns() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'invoices' THEN
    IF (NEW.status = 'paid') IS DISTINCT FROM (OLD.status = 'paid')
      OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
      OR NEW.stripe_invoice_id IS DISTINCT FROM OLD.stripe_invoice_id
      OR (NEW.status = 'void' AND OLD.status <> 'void' AND OLD.stripe_invoice_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Payments and Stripe invoices can only be changed through Stripe.';
    END IF;
  ELSIF TG_TABLE_NAME = 'subscriptions' THEN
    IF NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
      OR (OLD.stripe_subscription_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status)
      OR ((OLD.status <> 'pending' OR OLD.stripe_subscription_id IS NOT NULL)
        AND (NEW.plan_name, NEW.monthly_fee, NEW.monthly_hours) IS DISTINCT FROM (OLD.plan_name, OLD.monthly_fee, OLD.monthly_hours)) THEN
      RAISE EXCEPTION 'Plan, price and status of a billed subscription can only be changed through the billing actions.';
    END IF;
  ELSIF TG_TABLE_NAME = 'transactions' THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW.stripe_id IS DISTINCT FROM OLD.stripe_id THEN
      RAISE EXCEPTION 'Recorded payment amounts can''t be changed.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_billing_columns() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER invoices_billing_guard BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_billing_columns();
CREATE TRIGGER subscriptions_billing_guard BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.guard_billing_columns();
CREATE TRIGGER transactions_billing_guard BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.guard_billing_columns();

-- Staff status changes follow the transition map in src/lib/admin.ts (workflowActions). Server workflows (service role) are exempt.
CREATE OR REPLACE FUNCTION public.guard_application_status() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF (OLD.status::text, NEW.status::text) NOT IN (VALUES
    ('submitted','in_review'),
    ('in_review','approved'), ('in_review','info_requested'), ('in_review','escalated'), ('in_review','rejected'),
    ('info_requested','in_review'),
    ('escalated','approved'), ('escalated','in_review'), ('escalated','rejected')) THEN
    RAISE EXCEPTION 'An application can''t move from % to %.', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_application_status() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER application_status_guard BEFORE UPDATE OF status ON public.applications FOR EACH ROW EXECUTE FUNCTION public.guard_application_status();

-- Signed-in users may only check their own roles; staff (and server code) may check anyone's.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (_user_id = auth.uid() OR auth.uid() IS NULL
      OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Staff access needs a real mailbox confirmation. Users created already confirmed (auto-confirm, dashboard) get no role
-- automatically; grant those by hand.
DROP TRIGGER IF EXISTS on_auth_user_created_admin ON auth.users;

-- Keep the profile email in step with the sign-in email after a confirmed change.
CREATE OR REPLACE FUNCTION public.sync_profile_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email, updated_at = now() WHERE id = NEW.id;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.sync_profile_email() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_email_changed AFTER UPDATE OF email ON auth.users FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email) EXECUTE FUNCTION public.sync_profile_email();

-- Refunds are matched to the payment they came from.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS stripe_payment_intent text;
CREATE INDEX IF NOT EXISTS transactions_stripe_payment_intent_idx ON public.transactions (stripe_payment_intent);
