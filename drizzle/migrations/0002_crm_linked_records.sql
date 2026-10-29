-- Profile fields for full client management
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS company_size text,
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS internal_notes text;
ALTER TABLE public.profiles ALTER COLUMN status SET DEFAULT 'onboarding';

-- Links: application -> subscription -> projects -> invoices/transactions
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS archived_at timestamptz, ADD COLUMN IF NOT EXISTS internal_notes text;
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES public.applications(id),
  ADD COLUMN IF NOT EXISTS guarantee_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS guarantee_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS sales_received boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id),
  ADD COLUMN IF NOT EXISTS assigned_to text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id),
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id),
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id),
  ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id), ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.compliance_requests ADD COLUMN IF NOT EXISTS outcome_note text;

-- Backfill links for existing records
UPDATE public.subscriptions s SET application_id = a.id
FROM public.applications a WHERE s.application_id IS NULL AND a.user_id = s.user_id AND a.plan_name = s.plan_name;
INSERT INTO public.projects (user_id, name, service, status, subscription_id)
SELECT s.user_id, COALESCE(NULLIF(p.company, ''), trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))), 'Marketing',
  CASE WHEN s.status = 'active' THEN 'active' ELSE 'planned' END, s.id
FROM public.subscriptions s JOIN public.profiles p ON p.id = s.user_id
WHERE NOT EXISTS (SELECT 1 FROM public.projects pr WHERE pr.subscription_id = s.id);

-- Contacts
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'primary',
  email text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage contacts" ON public.contacts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Tasks and follow-ups
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription_id uuid REFERENCES public.subscriptions(id),
  project_id uuid REFERENCES public.projects(id),
  title text NOT NULL,
  details text,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  due_at date,
  assigned_to text,
  completed_at timestamptz,
  actor_label text NOT NULL DEFAULT 'System',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage tasks" ON public.tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Operational records become editable and deletable by staff; financial rows can be voided (updated) but never deleted.
CREATE POLICY "admin update activities" ON public.crm_activities FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete activities" ON public.crm_activities FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
GRANT UPDATE, DELETE ON public.crm_activities TO authenticated;
CREATE POLICY "admin update transactions" ON public.transactions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
GRANT UPDATE ON public.transactions TO authenticated;

CREATE TRIGGER audit_contacts AFTER INSERT OR UPDATE OR DELETE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_tasks AFTER INSERT OR UPDATE OR DELETE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- Hours go to the subscription the project belongs to.
CREATE OR REPLACE FUNCTION public.apply_time_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sub uuid;
BEGIN
  UPDATE public.projects SET hours = hours + NEW.hours WHERE id = NEW.project_id RETURNING subscription_id INTO sub;
  IF sub IS NOT NULL THEN
    UPDATE public.subscriptions SET hours_used = hours_used + NEW.hours WHERE id = sub;
  ELSE
    UPDATE public.subscriptions SET hours_used = hours_used + NEW.hours WHERE user_id = NEW.user_id AND status = 'active';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_time_entry() FROM PUBLIC, anon, authenticated;

-- Signup creates linked application, subscription and a project named after the business.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m jsonb := new.raw_user_meta_data; acct text; app_id uuid; sub_id uuid;
BEGIN
  acct := coalesce(m->>'account_number', '');
  IF acct !~ '^\d{10}$' OR EXISTS (SELECT 1 FROM profiles WHERE account_number = acct) THEN
    LOOP
      acct := lpad((floor(random()*9000000000)+1000000000)::bigint::text, 10, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE account_number = acct);
    END LOOP;
  END IF;
  INSERT INTO profiles(id, account_number, first_name, last_name, company, country, phone, email, terms_accepted_at)
  VALUES (new.id, acct, m->>'first_name', m->>'last_name', m->>'company', m->>'country', m->>'phone', new.email,
    CASE WHEN m ? 'plan_id' THEN now() END);
  IF m ? 'plan_id' THEN
    INSERT INTO applications(user_id, account_number, plan_id, plan_name, monthly_fee, monthly_hours, signed_at)
    VALUES (new.id, acct, m->>'plan_id', m->>'plan_name', (m->>'monthly_fee')::int, (m->>'monthly_hours')::int, now())
    RETURNING id INTO app_id;
    INSERT INTO application_events(application_id, actor_label, action, to_status, note)
    VALUES (app_id, 'Applicant', 'Application submitted and digitally signed', 'submitted', 'Plan: ' || (m->>'plan_name'));
    INSERT INTO subscriptions(user_id, plan_name, monthly_fee, monthly_hours, status, application_id)
    VALUES (new.id, m->>'plan_name', (m->>'monthly_fee')::int, (m->>'monthly_hours')::int, 'pending', app_id)
    RETURNING id INTO sub_id;
    INSERT INTO projects(user_id, name, service, status, subscription_id, description)
    VALUES (new.id, COALESCE(NULLIF(m->>'company',''), trim(coalesce(m->>'first_name','') || ' ' || coalesce(m->>'last_name',''))),
      'Marketing', 'planned', sub_id, (m->>'plan_name') || ' plan');
  END IF;
  RETURN new;
END $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;