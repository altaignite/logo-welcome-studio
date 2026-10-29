ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS address_line text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'onboarding',
  ADD COLUMN IF NOT EXISTS account_manager text,
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_sell boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS assigned_to text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS started_at date,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE TABLE public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'call',
  direction text,
  subject text NOT NULL,
  body text,
  outcome text,
  duration_minutes integer,
  follow_up_at date,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_label text NOT NULL DEFAULT 'System',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  body text NOT NULL,
  internal boolean NOT NULL DEFAULT false,
  actor_id uuid,
  actor_label text NOT NULL DEFAULT 'System',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  hours numeric NOT NULL CHECK (hours > 0 AND hours <= 24),
  description text NOT NULL,
  worked_on date NOT NULL DEFAULT CURRENT_DATE,
  actor_id uuid,
  actor_label text NOT NULL DEFAULT 'System',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.compliance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  details text,
  due_at date NOT NULL DEFAULT (CURRENT_DATE + 45),
  completed_at timestamptz,
  actor_label text NOT NULL DEFAULT 'System',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid,
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  changes jsonb,
  actor_id uuid,
  actor_label text NOT NULL DEFAULT 'System',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.audit_log (account_id, created_at DESC);
CREATE INDEX ON public.crm_activities (user_id, occurred_at DESC);
CREATE INDEX ON public.ticket_messages (ticket_id, created_at);
CREATE INDEX ON public.time_entries (project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activities, public.ticket_messages, public.time_entries, public.compliance_requests TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.crm_activities, public.ticket_messages, public.time_entries, public.compliance_requests, public.audit_log TO service_role;

ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read activities" ON public.crm_activities FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin add activities" ON public.crm_activities FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_id = auth.uid());
CREATE POLICY "admin read ticket msgs" ON public.ticket_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR (user_id = auth.uid() AND NOT internal));
CREATE POLICY "admin add ticket msgs" ON public.ticket_messages FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_id = auth.uid());
CREATE POLICY "admin read time" ON public.time_entries FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());
CREATE POLICY "admin add time" ON public.time_entries FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_id = auth.uid());
CREATE POLICY "admin read compliance" ON public.compliance_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin add compliance" ON public.compliance_requests FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update compliance" ON public.compliance_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin read audit" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Financial records are retained: no deletes by staff.
DROP POLICY IF EXISTS "admin write" ON public.invoices;
CREATE POLICY "admin insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update invoices" ON public.invoices FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admin write" ON public.transactions;
CREATE POLICY "admin insert transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Automatic audit trail for every change on client records.
CREATE OR REPLACE FUNCTION public.write_audit_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  diff jsonb;
  acct uuid;
  label text;
BEGIN
  acct := COALESCE(NULLIF(rec->>'user_id','')::uuid, CASE WHEN TG_TABLE_NAME = 'profiles' THEN (rec->>'id')::uuid END);
  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)) INTO diff
    FROM jsonb_each(to_jsonb(NEW)) n JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
    WHERE n.value IS DISTINCT FROM o.value AND n.key NOT IN ('updated_at');
    IF diff IS NULL THEN RETURN NEW; END IF;
  ELSE
    diff := rec;
  END IF;
  SELECT email INTO label FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.audit_log (account_id, table_name, record_id, action, changes, actor_id, actor_label)
  VALUES (acct, TG_TABLE_NAME, (rec->>'id')::uuid, lower(TG_OP), diff, auth.uid(), COALESCE(label, 'System'));
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE EXECUTE ON FUNCTION public.write_audit_log() FROM PUBLIC, anon, authenticated;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','applications','subscriptions','projects','invoices','transactions','support_tickets','ticket_messages','time_entries','crm_activities','compliance_requests'] LOOP
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()', t);
  END LOOP;
END $$;

-- Logged hours count towards the project and the active subscription allowance.
CREATE OR REPLACE FUNCTION public.apply_time_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.projects SET hours = hours + NEW.hours WHERE id = NEW.project_id;
  UPDATE public.subscriptions SET hours_used = hours_used + NEW.hours WHERE user_id = NEW.user_id AND status = 'active';
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_time_entry() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER time_entry_apply AFTER INSERT ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.apply_time_entry();

UPDATE public.profiles p SET terms_accepted_at = a.signed_at FROM public.applications a WHERE a.user_id = p.id AND p.terms_accepted_at IS NULL;