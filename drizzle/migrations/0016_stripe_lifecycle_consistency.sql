ALTER TABLE public.invoices ADD COLUMN payment_effects_applied_at timestamptz;
ALTER TABLE public.subscriptions ADD COLUMN paused_for_nonpayment boolean NOT NULL DEFAULT false;
ALTER TABLE public.projects ADD COLUMN billing_previous_status text;
ALTER TABLE public.tasks ADD COLUMN billing_previous_status text;
ALTER TABLE public.applications ADD COLUMN billing_previous_status public.application_status;
CREATE OR REPLACE FUNCTION public.sync_linked_billing_work() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE held boolean; app_old public.application_status;
BEGIN
 SELECT status IN ('on_hold','suspended','cancelled','closed') INTO held FROM public.profiles WHERE id=NEW.user_id;
 IF NEW.status = 'cancelled' THEN
  UPDATE public.projects SET status='cancelled', billing_previous_status=NULL WHERE subscription_id=NEW.id AND status NOT IN ('completed','cancelled');
  UPDATE public.tasks SET status='cancelled', billing_previous_status=NULL WHERE (subscription_id=NEW.id OR project_id IN (SELECT id FROM public.projects WHERE subscription_id=NEW.id)) AND status NOT IN ('completed','cancelled');
  IF NEW.application_id IS NOT NULL THEN UPDATE public.applications SET archived_at=COALESCE(archived_at,now()) WHERE id=NEW.application_id; END IF;
 ELSIF NEW.status IN ('pending','past_due','suspended','paused') OR held THEN
  UPDATE public.projects SET billing_previous_status=COALESCE(billing_previous_status,status), status='on_hold' WHERE subscription_id=NEW.id AND status IN ('active','planned','pending');
  UPDATE public.tasks SET billing_previous_status=COALESCE(billing_previous_status,status), status='on_hold' WHERE (subscription_id=NEW.id OR project_id IN (SELECT id FROM public.projects WHERE subscription_id=NEW.id)) AND status NOT IN ('completed','cancelled','on_hold');
  IF NEW.status IN ('past_due','suspended','paused') AND NEW.application_id IS NOT NULL THEN
   UPDATE public.applications SET billing_previous_status=COALESCE(billing_previous_status,status),status='suspended' WHERE id=NEW.application_id AND status NOT IN ('rejected','suspended');
   IF FOUND THEN INSERT INTO public.application_events(application_id,actor_label,action,to_status,note) VALUES(NEW.application_id,'Billing','Work held','suspended',COALESCE(NEW.payment_warning,'Work paused until this subscription is active')); END IF;
  END IF;
 ELSIF NEW.status='active' AND NEW.started_at IS NOT NULL THEN
  UPDATE public.projects SET status=CASE WHEN billing_previous_status IN ('planned','pending') THEN 'active' ELSE billing_previous_status END,billing_previous_status=NULL WHERE subscription_id=NEW.id AND status='on_hold' AND billing_previous_status IS NOT NULL;
  UPDATE public.tasks SET status=billing_previous_status,billing_previous_status=NULL WHERE (subscription_id=NEW.id OR project_id IN (SELECT id FROM public.projects WHERE subscription_id=NEW.id)) AND status='on_hold' AND billing_previous_status IS NOT NULL;
  IF NEW.application_id IS NOT NULL THEN
   SELECT billing_previous_status INTO app_old FROM public.applications WHERE id=NEW.application_id;
   UPDATE public.applications SET status=billing_previous_status,billing_previous_status=NULL WHERE id=NEW.application_id AND status='suspended' AND billing_previous_status IS NOT NULL;
   IF FOUND THEN INSERT INTO public.application_events(application_id,actor_label,action,to_status,note) VALUES(NEW.application_id,'Billing','Work restored',app_old,'Payment standing restored'); END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.sync_linked_billing_work() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_linked_billing_work AFTER INSERT OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.sync_linked_billing_work();
CREATE OR REPLACE FUNCTION public.apply_paid_invoice_effects(_invoice uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv public.invoices;
BEGIN
 SELECT * INTO inv FROM public.invoices WHERE id=_invoice FOR UPDATE;
 IF NOT FOUND OR inv.status <> 'paid' OR inv.payment_effects_applied_at IS NOT NULL THEN RETURN false; END IF;
 IF inv.kind='renewal' AND inv.subscription_id IS NOT NULL THEN
  UPDATE public.subscriptions SET hours_used=0,overage_billed_hours=0 WHERE id=inv.subscription_id;
 END IF;
 UPDATE public.invoices SET payment_effects_applied_at=now() WHERE id=inv.id;
 RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_paid_invoice_effects(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_paid_invoice_effects(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.guard_time_entry_billing() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.projects; s public.subscriptions; t public.tasks; approval boolean;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=NEW.project_id;
 IF p.id IS NULL OR p.user_id<>NEW.user_id THEN RAISE EXCEPTION 'Project does not belong to this client'; END IF;
 IF p.status<>'active' THEN RAISE EXCEPTION 'Work is on hold for this project'; END IF;
 IF NEW.hours<=0 THEN RAISE EXCEPTION 'Hours must be positive'; END IF;
 IF NEW.task_id IS NOT NULL THEN
  SELECT * INTO t FROM public.tasks WHERE id=NEW.task_id;
  IF t.id IS NULL OR t.project_id IS DISTINCT FROM p.id OR t.user_id<>NEW.user_id OR t.subscription_id IS DISTINCT FROM p.subscription_id THEN RAISE EXCEPTION 'Task must belong to this project and subscription'; END IF;
  IF t.status IN ('on_hold','cancelled','completed') THEN RAISE EXCEPTION 'This task cannot receive work'; END IF;
 END IF;
 IF p.subscription_id IS NOT NULL THEN
  SELECT * INTO s FROM public.subscriptions WHERE id=p.subscription_id FOR UPDATE;
  IF s.user_id<>NEW.user_id OR s.status<>'active' THEN RAISE EXCEPTION 'Subscription must be active before recording work'; END IF;
  SELECT overage_needs_approval INTO approval FROM public.billing_settings WHERE id=1;
  IF COALESCE(approval,true) AND s.hours_used+NEW.hours>s.monthly_hours AND NOT COALESCE(t.overage_approved,false) THEN RAISE EXCEPTION 'Client approval is required for extra hours'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_time_entry_billing() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_time_entry_billing BEFORE INSERT ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.guard_time_entry_billing();
CREATE OR REPLACE FUNCTION public.apply_time_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sub uuid; used numeric; cap numeric;
BEGIN
 UPDATE public.projects SET hours=hours+NEW.hours WHERE id=NEW.project_id RETURNING subscription_id INTO sub;
 IF sub IS NOT NULL THEN UPDATE public.subscriptions SET hours_used=hours_used+NEW.hours WHERE id=sub RETURNING hours_used,monthly_hours INTO used,cap; END IF;
 IF NEW.task_id IS NOT NULL AND used>cap THEN UPDATE public.tasks SET over_allowance=true WHERE id=NEW.task_id; END IF;
 RETURN NEW;
END $$;
NOTIFY pgrst,'reload schema';