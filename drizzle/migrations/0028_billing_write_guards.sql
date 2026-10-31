-- Money fields change only through the server (Stripe-backed server functions, the signed webhook, the daily sync), never by a
-- direct table write from a browser. RLS lets staff edit these tables for everyday fields, so these triggers stop signed-in users
-- (staff included) from changing prices, amounts or payment state. Server code runs as service_role and is unaffected.
-- Complements guard_billing_columns (0010), which covers edits; this adds inserts, pending-plan prices and start dates.

-- The official plans, the same table handle_new_user uses.
CREATE OR REPLACE FUNCTION public.is_standard_plan(_name text, _fee numeric, _hours numeric) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT (_name, _fee, _hours) IN (('Starter', 199::numeric, 5::numeric), ('Growth', 499::numeric, 15::numeric), ('Scale', 999::numeric, 35::numeric)) $$;

CREATE OR REPLACE FUNCTION public.guard_billing_writes() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'authenticated' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'subscriptions' THEN
    IF (TG_OP = 'INSERT' OR (NEW.plan_name, NEW.monthly_fee, NEW.monthly_hours) IS DISTINCT FROM (OLD.plan_name, OLD.monthly_fee, OLD.monthly_hours))
       AND NOT public.is_standard_plan(NEW.plan_name, NEW.monthly_fee, NEW.monthly_hours) THEN
      RAISE EXCEPTION 'Plan prices come from the official plan list.' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.first_paid_at IS DISTINCT FROM OLD.first_paid_at) THEN
      RAISE EXCEPTION 'Billing dates and Stripe links change only through Stripe.' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF TG_TABLE_NAME = 'invoices' THEN
    IF TG_OP = 'INSERT' THEN RAISE EXCEPTION 'Invoices are created through Stripe.' USING ERRCODE = 'check_violation'; END IF;
    IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id OR NEW.stripe_invoice_id IS DISTINCT FROM OLD.stripe_invoice_id
       OR NEW.paid_at IS DISTINCT FROM OLD.paid_at OR ((NEW.status = 'paid') IS DISTINCT FROM (OLD.status = 'paid')) THEN
      RAISE EXCEPTION 'Invoice amounts and payments change only through Stripe.' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF TG_TABLE_NAME = 'transactions' THEN
    IF (NEW.stripe_id IS NOT NULL OR NEW.method = 'stripe')
       AND (TG_OP = 'INSERT' OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.stripe_id IS DISTINCT FROM OLD.stripe_id OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id) THEN
      RAISE EXCEPTION 'Stripe payments are recorded only from Stripe.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_billing_writes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS subscriptions_guard_billing ON public.subscriptions;
CREATE TRIGGER subscriptions_guard_billing BEFORE INSERT OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.guard_billing_writes();
DROP TRIGGER IF EXISTS invoices_guard_billing ON public.invoices;
CREATE TRIGGER invoices_guard_billing BEFORE INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_billing_writes();
DROP TRIGGER IF EXISTS transactions_guard_billing ON public.transactions;
CREATE TRIGGER transactions_guard_billing BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.guard_billing_writes();
