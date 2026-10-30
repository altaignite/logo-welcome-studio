-- Client and admin flow gaps: staff permission levels with optional enforced 2FA, notifications (in-app and email outbox),
-- client-visible application timeline, documents, signed agreements, deliverable reviews, client reports, onboarding briefs,
-- support SLAs and auto-assignment, message templates, global staff search and privacy request access for clients.

-- ===================================================================================================
-- Staff permission levels. Level rules mirror staffLevelGrants in src/lib/staff.ts.
-- ===================================================================================================
CREATE TABLE public.staff_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'viewer' CHECK (level IN ('owner','manager','support','billing','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Staff who already have access keep full access.
INSERT INTO public.staff_members (user_id, level) SELECT user_id, 'owner' FROM public.user_roles WHERE role = 'admin' ON CONFLICT DO NOTHING;
GRANT SELECT ON public.staff_members TO authenticated;
GRANT ALL ON public.staff_members TO service_role;
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read staff" ON public.staff_members FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER audit_staff_members AFTER INSERT OR UPDATE OR DELETE ON public.staff_members FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

CREATE TABLE public.security_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  require_staff_mfa boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.security_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT ON public.security_settings TO authenticated;
GRANT ALL ON public.security_settings TO service_role;
ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed in read security settings" ON public.security_settings FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.level_grants(_level text, _perm text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT _level = 'owner'
    OR (_level = 'manager' AND _perm IN ('accounts','billing','work'))
    OR (_level = 'support' AND _perm = 'work')
    OR (_level = 'billing' AND _perm = 'billing') $$;

-- The signed-in session meets the 2FA rule: aal2 when the user has a verified factor (or staff 2FA is required).
CREATE OR REPLACE FUNCTION public.mfa_satisfied() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    OR (NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = auth.uid() AND f.status = 'verified')
      AND NOT EXISTS (SELECT 1 FROM public.security_settings s WHERE s.require_staff_mfa
        AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'))) $$;
REVOKE EXECUTE ON FUNCTION public.mfa_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_satisfied() TO authenticated;

-- Staff write access: staff role, a level that grants the permission, and (for the caller's own session) 2FA when required.
CREATE OR REPLACE FUNCTION public.has_perm(_user_id uuid, _perm text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
    AND (auth.uid() IS NULL OR _user_id <> auth.uid() OR public.mfa_satisfied())
    AND EXISTS (SELECT 1 FROM public.staff_members s WHERE s.user_id = _user_id AND public.level_grants(s.level, _perm)) $$;
REVOKE EXECUTE ON FUNCTION public.has_perm(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_perm(uuid, text) TO authenticated;

-- Write policies move from "any staff" to the matching permission. Reads stay open to all staff.
DROP POLICY IF EXISTS "admin update profile" ON public.profiles;
CREATE POLICY "staff update profile" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_perm(auth.uid(), 'accounts')) WITH CHECK (public.has_perm(auth.uid(), 'accounts'));
DROP POLICY IF EXISTS "admin update apps" ON public.applications;
CREATE POLICY "staff update apps" ON public.applications FOR UPDATE TO authenticated
  USING (public.has_perm(auth.uid(), 'accounts')) WITH CHECK (public.has_perm(auth.uid(), 'accounts'));
DROP POLICY IF EXISTS "admin insert apps" ON public.applications;
CREATE POLICY "staff insert apps" ON public.applications FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(), 'accounts'));
DROP POLICY IF EXISTS "admin add events" ON public.application_events;
CREATE POLICY "staff add events" ON public.application_events FOR INSERT TO authenticated
  WITH CHECK (public.has_perm(auth.uid(), 'accounts') AND actor_id = auth.uid());
DROP POLICY IF EXISTS "admin insert subscriptions" ON public.subscriptions;
CREATE POLICY "staff insert subscriptions" ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (public.has_perm(auth.uid(), 'billing') OR public.has_perm(auth.uid(), 'accounts'));
DROP POLICY IF EXISTS "admin update subscriptions" ON public.subscriptions;
CREATE POLICY "staff update subscriptions" ON public.subscriptions FOR UPDATE TO authenticated
  USING (public.has_perm(auth.uid(), 'billing') OR public.has_perm(auth.uid(), 'accounts'))
  WITH CHECK (public.has_perm(auth.uid(), 'billing') OR public.has_perm(auth.uid(), 'accounts'));
DROP POLICY IF EXISTS "admin insert projects" ON public.projects;
CREATE POLICY "staff insert projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(), 'work'));
DROP POLICY IF EXISTS "admin update projects" ON public.projects;
CREATE POLICY "staff update projects" ON public.projects FOR UPDATE TO authenticated
  USING (public.has_perm(auth.uid(), 'work')) WITH CHECK (public.has_perm(auth.uid(), 'work'));
DROP POLICY IF EXISTS "admin insert invoices" ON public.invoices;
CREATE POLICY "staff insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(), 'billing'));
DROP POLICY IF EXISTS "admin update invoices" ON public.invoices;
CREATE POLICY "staff update invoices" ON public.invoices FOR UPDATE TO authenticated
  USING (public.has_perm(auth.uid(), 'billing')) WITH CHECK (public.has_perm(auth.uid(), 'billing'));
DROP POLICY IF EXISTS "admin insert transactions" ON public.transactions;
CREATE POLICY "staff insert transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(), 'billing'));
DROP POLICY IF EXISTS "admin update transactions" ON public.transactions;
CREATE POLICY "staff update transactions" ON public.transactions FOR UPDATE TO authenticated
  USING (public.has_perm(auth.uid(), 'billing')) WITH CHECK (public.has_perm(auth.uid(), 'billing'));
DROP POLICY IF EXISTS "admin write" ON public.support_tickets;
CREATE POLICY "staff write tickets" ON public.support_tickets FOR ALL TO authenticated
  USING (public.has_perm(auth.uid(), 'work')) WITH CHECK (public.has_perm(auth.uid(), 'work'));
DROP POLICY IF EXISTS "admin add activities" ON public.crm_activities;
CREATE POLICY "staff add activities" ON public.crm_activities FOR INSERT TO authenticated
  WITH CHECK (public.has_perm(auth.uid(), 'work') AND actor_id = auth.uid());
DROP POLICY IF EXISTS "admin update activities" ON public.crm_activities;
CREATE POLICY "staff update activities" ON public.crm_activities FOR UPDATE TO authenticated
  USING (public.has_perm(auth.uid(), 'work')) WITH CHECK (public.has_perm(auth.uid(), 'work'));
DROP POLICY IF EXISTS "admin delete activities" ON public.crm_activities;
CREATE POLICY "staff delete activities" ON public.crm_activities FOR DELETE TO authenticated USING (public.has_perm(auth.uid(), 'work'));
DROP POLICY IF EXISTS "admin add ticket msgs" ON public.ticket_messages;
CREATE POLICY "staff add ticket msgs" ON public.ticket_messages FOR INSERT TO authenticated
  WITH CHECK (public.has_perm(auth.uid(), 'work') AND actor_id = auth.uid());
DROP POLICY IF EXISTS "admin add time" ON public.time_entries;
CREATE POLICY "staff add time" ON public.time_entries FOR INSERT TO authenticated
  WITH CHECK (public.has_perm(auth.uid(), 'work') AND actor_id = auth.uid());
DROP POLICY IF EXISTS "admin add compliance" ON public.compliance_requests;
CREATE POLICY "staff add compliance" ON public.compliance_requests FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(), 'work'));
DROP POLICY IF EXISTS "admin update compliance" ON public.compliance_requests;
CREATE POLICY "staff update compliance" ON public.compliance_requests FOR UPDATE TO authenticated
  USING (public.has_perm(auth.uid(), 'work')) WITH CHECK (public.has_perm(auth.uid(), 'work'));
DROP POLICY IF EXISTS "admin manage contacts" ON public.contacts;
CREATE POLICY "staff read contacts" ON public.contacts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "staff write contacts" ON public.contacts FOR ALL TO authenticated
  USING (public.has_perm(auth.uid(), 'work')) WITH CHECK (public.has_perm(auth.uid(), 'work'));
DROP POLICY IF EXISTS "admin manage tasks" ON public.tasks;
CREATE POLICY "staff read tasks" ON public.tasks FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "staff write tasks" ON public.tasks FOR ALL TO authenticated
  USING (public.has_perm(auth.uid(), 'work')) WITH CHECK (public.has_perm(auth.uid(), 'work'));
DROP POLICY IF EXISTS "admin update billing rules" ON public.billing_settings;
CREATE POLICY "staff update billing rules" ON public.billing_settings FOR UPDATE TO authenticated
  USING (public.has_perm(auth.uid(), 'billing')) WITH CHECK (public.has_perm(auth.uid(), 'billing'));

-- ===================================================================================================
-- Notifications: in-app inbox plus an email outbox drained by /api/public/cron/notifications.
-- ===================================================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_notifications boolean NOT NULL DEFAULT true;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  -- In-app paths only, so a notification can never link off-site.
  link text CHECK (link IS NULL OR link ~ '^/[A-Za-z0-9]'),
  dedupe_key text UNIQUE,
  read_at timestamptz,
  email_to text,
  email_status text NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending','sent','skipped','failed')),
  email_attempts int NOT NULL DEFAULT 0,
  emailed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_email_pending ON public.notifications (created_at) WHERE email_status = 'pending';
GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Marks the caller's own notifications read (all when ids is null).
CREATE OR REPLACE FUNCTION public.mark_notifications_read(_ids uuid[] DEFAULT NULL) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE notifications SET read_at = now() WHERE user_id = auth.uid() AND read_at IS NULL AND (_ids IS NULL OR id = ANY(_ids));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify(_user uuid, _kind text, _title text, _body text, _link text, _email boolean DEFAULT true, _dedupe text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE addr text; wants boolean;
BEGIN
  IF _user IS NULL THEN RETURN; END IF;
  SELECT email, email_notifications INTO addr, wants FROM profiles WHERE id = _user;
  INSERT INTO notifications (user_id, kind, title, body, link, dedupe_key, email_to, email_status)
  VALUES (_user, _kind, left(_title, 200), left(_body, 2000), _link, _dedupe,
    CASE WHEN _email AND coalesce(wants, true) THEN addr END,
    CASE WHEN _email AND coalesce(wants, true) AND addr IS NOT NULL THEN 'pending' ELSE 'skipped' END)
  ON CONFLICT (dedupe_key) DO NOTHING;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify(uuid, text, text, text, text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify(uuid, text, text, text, text, boolean, text) TO service_role;

-- Notifies the assigned staff member (by email) when there is one, otherwise every staff member whose level grants the permission.
CREATE OR REPLACE FUNCTION public.notify_staff(_perm text, _assigned text, _kind text, _title text, _body text, _link text, _dedupe text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
  IF _assigned IS NOT NULL THEN
    SELECT p.id INTO target FROM profiles p JOIN user_roles r ON r.user_id = p.id AND r.role = 'admin'
      WHERE lower(p.email) = lower(_assigned) LIMIT 1;
  END IF;
  IF target IS NOT NULL THEN
    PERFORM notify(target, _kind, _title, _body, _link, true, CASE WHEN _dedupe IS NOT NULL THEN _dedupe || ':' || target END);
    RETURN;
  END IF;
  FOR target IN SELECT s.user_id FROM staff_members s JOIN user_roles r ON r.user_id = s.user_id AND r.role = 'admin'
      WHERE level_grants(s.level, _perm) LOOP
    PERFORM notify(target, _kind, _title, _body, _link, true, CASE WHEN _dedupe IS NOT NULL THEN _dedupe || ':' || target END);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_staff(text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_staff(text, text, text, text, text, text, text) TO service_role;

-- New staff (granted by the verified staff-domain trigger) start as viewers; owners are asked to set their level.
CREATE OR REPLACE FUNCTION public.on_staff_role_granted() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE who text;
BEGIN
  IF NEW.role <> 'admin' THEN RETURN NEW; END IF;
  INSERT INTO staff_members (user_id, level) VALUES (NEW.user_id, 'viewer') ON CONFLICT DO NOTHING;
  SELECT email INTO who FROM profiles WHERE id = NEW.user_id;
  PERFORM notify_staff('staff', NULL, 'staff', 'New staff member needs an access level', coalesce(who, 'A new staff member') || ' can view the admin but not change anything yet.', '/admin/staff', 'staff-new:' || NEW.user_id);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.on_staff_role_granted() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER staff_role_granted AFTER INSERT ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.on_staff_role_granted();

-- ===================================================================================================
-- Application timeline the client can see. Mirrors clientVisibleStatuses and clientResponse in src/lib/admin.ts.
-- ===================================================================================================
ALTER TABLE public.application_events ADD COLUMN IF NOT EXISTS visible_to_client boolean NOT NULL DEFAULT false;
UPDATE public.application_events SET visible_to_client = true WHERE to_status::text IN ('submitted','info_requested','approved','rejected','suspended');

-- Status changes into a client-facing status are always shared with the client, including their note; staff can't share anything else.
CREATE OR REPLACE FUNCTION public.set_event_visibility() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE shared boolean := NEW.to_status IS NOT NULL AND NEW.to_status::text IN ('submitted','info_requested','approved','rejected','suspended');
BEGIN
  NEW.visible_to_client := CASE WHEN auth.uid() IS NULL THEN NEW.visible_to_client OR shared ELSE shared END;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_event_visibility() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER application_event_visibility BEFORE INSERT ON public.application_events FOR EACH ROW EXECUTE FUNCTION public.set_event_visibility();

CREATE POLICY "client read shared events" ON public.application_events FOR SELECT TO authenticated
  USING (visible_to_client AND EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND a.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.notify_application_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE app applications;
BEGIN
  SELECT * INTO app FROM applications WHERE id = NEW.application_id;
  IF app.id IS NULL THEN RETURN NEW; END IF;
  IF NEW.actor_id IS NOT NULL AND NEW.actor_id = app.user_id THEN
    PERFORM notify_staff('accounts', app.assigned_to, 'application', 'Client replied on the ' || app.plan_name || ' application', NEW.note, '/admin/applications/' || app.id);
  -- Suspensions are announced by the subscription status notification instead.
  ELSIF NEW.visible_to_client AND NEW.to_status IS DISTINCT FROM NEW.from_status AND NEW.to_status::text NOT IN ('submitted','suspended') THEN
    PERFORM notify(app.user_id, 'application',
      CASE NEW.to_status::text
        WHEN 'info_requested' THEN 'We need a little more information'
        WHEN 'approved' THEN 'Your application was approved'
        WHEN 'rejected' THEN 'An update on your application'
        ELSE NEW.action END,
      NEW.note, '/dashboard/application/' || app.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_application_event() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER application_event_notify AFTER INSERT ON public.application_events FOR EACH ROW EXECUTE FUNCTION public.notify_application_event();

CREATE OR REPLACE FUNCTION public.notify_new_application() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'submitted' THEN
    PERFORM notify_staff('accounts', NULL, 'application', 'New application: ' || NEW.plan_name || ' plan', 'Account ' || NEW.account_number, '/admin/applications/' || NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_new_application() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER application_created_notify AFTER INSERT ON public.applications FOR EACH ROW EXECUTE FUNCTION public.notify_new_application();

-- ===================================================================================================
-- Support: first-response and last-message times for SLAs, auto-assignment to the account manager, notifications.
-- ===================================================================================================
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_client_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_staff_message_at timestamptz;
UPDATE public.support_tickets t SET
  first_response_at = (SELECT min(m.created_at) FROM public.ticket_messages m WHERE m.ticket_id = t.id AND NOT m.internal AND m.actor_id IS DISTINCT FROM t.user_id),
  last_staff_message_at = (SELECT max(m.created_at) FROM public.ticket_messages m WHERE m.ticket_id = t.id AND NOT m.internal AND m.actor_id IS DISTINCT FROM t.user_id),
  last_client_message_at = (SELECT max(m.created_at) FROM public.ticket_messages m WHERE m.ticket_id = t.id AND m.actor_id = t.user_id);

CREATE OR REPLACE FUNCTION public.on_ticket_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t support_tickets; first boolean;
BEGIN
  IF NEW.internal THEN RETURN NEW; END IF;
  SELECT * INTO t FROM support_tickets WHERE id = NEW.ticket_id;
  IF t.id IS NULL THEN RETURN NEW; END IF;
  IF NEW.actor_id IS NOT NULL AND NEW.actor_id = t.user_id THEN
    first := t.last_client_message_at IS NULL;
    UPDATE support_tickets SET last_client_message_at = NEW.created_at, updated_at = now(),
      status = CASE WHEN status = 'waiting_on_client' THEN 'in_progress' ELSE status END WHERE id = t.id;
    PERFORM notify_staff('work', t.assigned_to, 'ticket', CASE WHEN first THEN 'New support request: ' ELSE 'Client replied: ' END || t.subject,
      left(NEW.body, 300), '/admin/records/support_tickets/' || t.id);
  ELSE
    UPDATE support_tickets SET first_response_at = coalesce(first_response_at, NEW.created_at), last_staff_message_at = NEW.created_at, updated_at = now() WHERE id = t.id;
    PERFORM notify(t.user_id, 'ticket', 'New reply: ' || t.subject, left(NEW.body, 300), '/dashboard/ticket/' || t.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.on_ticket_message() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER ticket_message_effects AFTER INSERT ON public.ticket_messages FOR EACH ROW EXECUTE FUNCTION public.on_ticket_message();

-- Runs after insert (RLS checks the client's row before this) and assigns the account manager when they are staff.
CREATE OR REPLACE FUNCTION public.assign_new_ticket() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE mgr text;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN RETURN NEW; END IF;
  SELECT p.account_manager INTO mgr FROM profiles p WHERE p.id = NEW.user_id;
  IF mgr IS NOT NULL AND EXISTS (SELECT 1 FROM profiles s JOIN user_roles r ON r.user_id = s.id AND r.role = 'admin' WHERE lower(s.email) = lower(mgr)) THEN
    UPDATE support_tickets SET assigned_to = mgr WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.assign_new_ticket() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER ticket_auto_assign AFTER INSERT ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.assign_new_ticket();

-- ===================================================================================================
-- Client notifications for plan, task, invoice and privacy changes.
-- ===================================================================================================
CREATE OR REPLACE FUNCTION public.notify_subscription_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status = 'pending' THEN RETURN NEW; END IF;
  PERFORM notify(NEW.user_id, 'subscription',
    CASE NEW.status
      WHEN 'active' THEN 'Your ' || NEW.plan_name || ' plan is active'
      WHEN 'paused' THEN 'Your ' || NEW.plan_name || ' plan is paused'
      WHEN 'past_due' THEN 'Payment failed for your ' || NEW.plan_name || ' plan'
      WHEN 'suspended' THEN 'Your ' || NEW.plan_name || ' plan was suspended'
      WHEN 'cancelled' THEN 'Your ' || NEW.plan_name || ' plan was cancelled'
      ELSE 'Your ' || NEW.plan_name || ' plan changed' END,
    NEW.payment_warning, '/dashboard/subscription/' || NEW.id);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_subscription_status() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER subscription_status_notify AFTER UPDATE OF status ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.notify_subscription_status();

CREATE OR REPLACE FUNCTION public.notify_task_overage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.over_allowance AND NOT OLD.over_allowance AND NOT NEW.overage_approved THEN
    PERFORM notify(NEW.user_id, 'task', 'Approve extra hours for ' || NEW.title,
      'This task needs more hours than your plan has left this month.', '/dashboard/task/' || NEW.id, true, 'overage:' || NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_task_overage() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER task_overage_notify AFTER UPDATE OF over_allowance ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.notify_task_overage();

-- Stripe already emails invoices, so new ones are in-app only; overdue ones are emailed once.
CREATE OR REPLACE FUNCTION public.notify_invoice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'open' THEN
    PERFORM notify(NEW.user_id, 'invoice', 'New invoice ' || NEW.number, NEW.description, '/dashboard/invoice/' || NEW.id, false, 'invoice-new:' || NEW.id);
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'overdue' AND OLD.status <> 'overdue' THEN
    PERFORM notify(NEW.user_id, 'invoice', 'Invoice ' || NEW.number || ' is overdue', 'Interest is added each month until it is paid.', '/dashboard/invoice/' || NEW.id, true, 'invoice-overdue:' || NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_invoice() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER invoice_notify AFTER INSERT OR UPDATE OF status ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.notify_invoice();

-- Clients can follow their own privacy requests.
CREATE POLICY "client read own compliance" ON public.compliance_requests FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_compliance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM notify_staff('work', NULL, 'privacy', 'New privacy request: ' || replace(NEW.kind, '_', ' '), 'Due ' || NEW.due_at, '/admin/records/compliance_requests/' || NEW.id);
  ELSIF NEW.status <> OLD.status AND NEW.status IN ('completed','denied') THEN
    PERFORM notify(NEW.user_id, 'privacy', 'Your ' || replace(NEW.kind, '_', ' ') || ' request was ' || NEW.status, NEW.outcome_note, '/dashboard/profile');
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_compliance() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER compliance_notify AFTER INSERT OR UPDATE OF status ON public.compliance_requests FOR EACH ROW EXECUTE FUNCTION public.notify_compliance();

-- Follow-ups can be ticked off.
ALTER TABLE public.crm_activities ADD COLUMN IF NOT EXISTS follow_up_done_at timestamptz;

-- ===================================================================================================
-- Documents: private storage bucket, accessed only through server functions that issue short-lived signed URLs.
-- ===================================================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('client-files', 'client-files', false, 26214400, ARRAY[
  'application/pdf','image/png','image/jpeg','image/gif','image/webp','text/plain','text/csv','application/json','application/zip',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'video/mp4','audio/mpeg'])
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'file' CHECK (kind IN ('file','deliverable','report','export')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  -- Every object lives under its client's folder, so a document can only ever point at that client's files.
  storage_path text NOT NULL UNIQUE CHECK (split_part(storage_path, '/', 1) = user_id::text),
  size_bytes bigint,
  mime_type text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready')),
  related_table text CHECK (related_table IN ('applications','projects','tasks','support_tickets','deliverables','client_reports','compliance_requests')),
  related_id uuid,
  visible_to_client boolean NOT NULL DEFAULT true,
  uploaded_by uuid,
  uploaded_by_label text NOT NULL DEFAULT 'System',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.documents (user_id, created_at DESC);
CREATE INDEX ON public.documents (related_table, related_id);
GRANT SELECT, UPDATE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read documents" ON public.documents FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "client read own documents" ON public.documents FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND visible_to_client AND status = 'ready' AND archived_at IS NULL);
CREATE POLICY "staff update documents" ON public.documents FOR UPDATE TO authenticated
  USING (public.has_perm(auth.uid(), 'work')) WITH CHECK (public.has_perm(auth.uid(), 'work'));
CREATE TRIGGER audit_documents AFTER INSERT OR UPDATE OR DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- Staff may rename, hide or archive a document, never repoint it at another file or client.
CREATE OR REPLACE FUNCTION public.guard_document() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (NEW.user_id, NEW.storage_path, NEW.kind, NEW.status, NEW.uploaded_by, NEW.size_bytes, NEW.mime_type, NEW.related_table, NEW.related_id)
    IS DISTINCT FROM (OLD.user_id, OLD.storage_path, OLD.kind, OLD.status, OLD.uploaded_by, OLD.size_bytes, OLD.mime_type, OLD.related_table, OLD.related_id) THEN
    RAISE EXCEPTION 'Only the title, visibility and archive state of a document can be changed.';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_document() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER document_guard BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.guard_document();

CREATE OR REPLACE FUNCTION public.notify_document() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status <> 'ready' OR (TG_OP = 'UPDATE' AND OLD.status = 'ready') THEN RETURN NEW; END IF;
  IF NEW.uploaded_by IS NOT NULL AND NEW.uploaded_by = NEW.user_id THEN
    PERFORM notify_staff('work', (SELECT account_manager FROM profiles WHERE id = NEW.user_id), 'document', 'Client uploaded ' || NEW.title, NULL, '/admin/accounts/' || NEW.user_id);
  ELSIF NEW.visible_to_client AND NEW.kind NOT IN ('deliverable','report') THEN
    PERFORM notify(NEW.user_id, 'document', 'New file: ' || NEW.title, NULL, '/dashboard/documents');
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_document() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER document_notify AFTER INSERT OR UPDATE OF status ON public.documents FOR EACH ROW EXECUTE FUNCTION public.notify_document();

-- Signed agreements: an immutable server-rendered copy of what the client signed (see agreementDocuments in src/lib/signup.ts).
CREATE TABLE public.signed_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  application_id uuid NOT NULL REFERENCES public.applications(id),
  title text NOT NULL,
  body text NOT NULL,
  version text NOT NULL,
  sha256 text NOT NULL,
  signed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, title)
);
GRANT SELECT ON public.signed_agreements TO authenticated;
GRANT ALL ON public.signed_agreements TO service_role;
ALTER TABLE public.signed_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or staff agreements" ON public.signed_agreements FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.guard_signed_agreement() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Signed agreements can''t be changed or deleted.';
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_signed_agreement() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER signed_agreement_immutable BEFORE UPDATE OR DELETE ON public.signed_agreements FOR EACH ROW EXECUTE FUNCTION public.guard_signed_agreement();

-- ===================================================================================================
-- Deliverables sent to the client for review and sign-off.
-- ===================================================================================================
CREATE TABLE public.deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription_id uuid REFERENCES public.subscriptions(id),
  project_id uuid REFERENCES public.projects(id),
  task_id uuid REFERENCES public.tasks(id),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','changes_requested','archived')),
  assigned_to text,
  due_at date,
  review_round int NOT NULL DEFAULT 0,
  submitted_at timestamptz,
  decided_at timestamptz,
  client_feedback text,
  actor_label text NOT NULL DEFAULT 'System',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.deliverables (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.deliverables TO authenticated;
GRANT ALL ON public.deliverables TO service_role;
ALTER TABLE public.deliverables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read deliverables" ON public.deliverables FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "client read own deliverables" ON public.deliverables FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND status <> 'draft' AND archived_at IS NULL);
CREATE POLICY "staff insert deliverables" ON public.deliverables FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(), 'work'));
CREATE POLICY "staff update deliverables" ON public.deliverables FOR UPDATE TO authenticated
  USING (public.has_perm(auth.uid(), 'work')) WITH CHECK (public.has_perm(auth.uid(), 'work'));
CREATE TRIGGER audit_deliverables AFTER INSERT OR UPDATE OR DELETE ON public.deliverables FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- Only the client (through reviewDeliverable, service role) records a decision; staff can send, withdraw or archive.
CREATE OR REPLACE FUNCTION public.guard_deliverable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft','in_review') OR NEW.client_feedback IS NOT NULL OR NEW.decided_at IS NOT NULL THEN
      RAISE EXCEPTION 'New deliverables start as a draft or are sent for review.';
    END IF;
    NEW.review_round := 0; NEW.submitted_at := NULL;
  ELSIF (NEW.status IN ('approved','changes_requested') AND NEW.status IS DISTINCT FROM OLD.status)
    OR NEW.client_feedback IS DISTINCT FROM OLD.client_feedback OR NEW.decided_at IS DISTINCT FROM OLD.decided_at THEN
    RAISE EXCEPTION 'Only the client can approve or request changes to a deliverable.';
  END IF;
  IF NEW.status = 'in_review' AND (TG_OP = 'INSERT' OR OLD.status <> 'in_review') THEN
    NEW.submitted_at := now(); NEW.review_round := coalesce(NEW.review_round, 0) + 1;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_deliverable() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER deliverable_guard BEFORE INSERT OR UPDATE ON public.deliverables FOR EACH ROW EXECUTE FUNCTION public.guard_deliverable();

CREATE OR REPLACE FUNCTION public.notify_deliverable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'in_review' THEN
    PERFORM notify(NEW.user_id, 'deliverable', 'Ready for your review: ' || NEW.title, NEW.description, '/dashboard/deliverable/' || NEW.id, true, 'deliverable-review:' || NEW.id || ':' || NEW.review_round);
  ELSIF NEW.status IN ('approved','changes_requested') THEN
    PERFORM notify_staff('work', NEW.assigned_to, 'deliverable',
      CASE NEW.status WHEN 'approved' THEN 'Client approved ' ELSE 'Client requested changes to ' END || NEW.title,
      NEW.client_feedback, '/admin/records/deliverables/' || NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_deliverable() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER deliverable_notify AFTER INSERT OR UPDATE OF status ON public.deliverables FOR EACH ROW EXECUTE FUNCTION public.notify_deliverable();

-- ===================================================================================================
-- Client results reports (metrics plus attached files), published by staff.
-- ===================================================================================================
CREATE TABLE public.client_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription_id uuid REFERENCES public.subscriptions(id),
  title text NOT NULL,
  period_start date NOT NULL,
  summary text,
  metrics jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(metrics) = 'array' AND jsonb_array_length(metrics) <= 30),
  published_at timestamptz,
  actor_label text NOT NULL DEFAULT 'System',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.client_reports (user_id, period_start DESC);
GRANT SELECT, INSERT, UPDATE ON public.client_reports TO authenticated;
GRANT ALL ON public.client_reports TO service_role;
ALTER TABLE public.client_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read reports" ON public.client_reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "client read published reports" ON public.client_reports FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND published_at IS NOT NULL AND archived_at IS NULL);
CREATE POLICY "staff insert reports" ON public.client_reports FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(), 'work'));
CREATE POLICY "staff update reports" ON public.client_reports FOR UPDATE TO authenticated
  USING (public.has_perm(auth.uid(), 'work')) WITH CHECK (public.has_perm(auth.uid(), 'work'));
CREATE TRIGGER audit_client_reports AFTER INSERT OR UPDATE OR DELETE ON public.client_reports FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

CREATE OR REPLACE FUNCTION public.notify_report() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.published_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.published_at IS NULL) THEN
    PERFORM notify(NEW.user_id, 'report', 'Your report is ready: ' || NEW.title, NEW.summary, '/dashboard/report/' || NEW.id, true, 'report:' || NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_report() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER report_notify AFTER INSERT OR UPDATE OF published_at ON public.client_reports FOR EACH ROW EXECUTE FUNCTION public.notify_report();

-- ===================================================================================================
-- Onboarding brief (questions and validation in src/lib/onboarding.ts, saved through saveOnboardingBrief).
-- ===================================================================================================
CREATE TABLE public.onboarding_briefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(answers) = 'object' AND pg_column_size(answers) < 40000),
  submitted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.onboarding_briefs TO authenticated;
GRANT ALL ON public.onboarding_briefs TO service_role;
ALTER TABLE public.onboarding_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or staff brief" ON public.onboarding_briefs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.notify_brief() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.submitted_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.submitted_at IS NULL) THEN
    PERFORM notify_staff('work', (SELECT account_manager FROM profiles WHERE id = NEW.user_id), 'onboarding', 'Onboarding brief submitted',
      (SELECT coalesce(company, first_name) FROM profiles WHERE id = NEW.user_id), '/admin/accounts/' || NEW.user_id);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_brief() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER brief_notify AFTER INSERT OR UPDATE OF submitted_at ON public.onboarding_briefs FOR EACH ROW EXECUTE FUNCTION public.notify_brief();

-- ===================================================================================================
-- Message templates for client emails.
-- ===================================================================================================
CREATE TABLE public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 120),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 200),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  purpose text NOT NULL DEFAULT 'service' CHECK (purpose IN ('service','marketing')),
  updated_by_label text NOT NULL DEFAULT 'System',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read templates" ON public.message_templates FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "staff write templates" ON public.message_templates FOR ALL TO authenticated
  USING (public.has_perm(auth.uid(), 'work')) WITH CHECK (public.has_perm(auth.uid(), 'work'));

-- ===================================================================================================
-- Scheduled job bookkeeping (daily reminders run once per day from the notifications job).
-- ===================================================================================================
CREATE TABLE public.job_runs (
  name text PRIMARY KEY,
  last_run_on date,
  last_run_at timestamptz
);
GRANT ALL ON public.job_runs TO service_role;
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

-- ===================================================================================================
-- Staff directory (with 2FA status) and global search. Both are staff only.
-- ===================================================================================================
CREATE OR REPLACE FUNCTION public.staff_directory() RETURNS TABLE (user_id uuid, email text, name text, level text, mfa_enabled boolean, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
    SELECT r.user_id, p.email, nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), coalesce(s.level, 'viewer'),
      EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = r.user_id AND f.status = 'verified'), coalesce(s.created_at, p.created_at)
    FROM user_roles r LEFT JOIN profiles p ON p.id = r.user_id LEFT JOIN staff_members s ON s.user_id = r.user_id
    WHERE r.role = 'admin' ORDER BY p.email;
END $$;
REVOKE EXECUTE ON FUNCTION public.staff_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_directory() TO authenticated;

-- Runs as the caller, so row level security still decides what is found.
CREATE OR REPLACE FUNCTION public.staff_search(q text) RETURNS TABLE (kind text, id uuid, title text, subtitle text, account_id uuid)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE pat text; digits text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  q := btrim(coalesce(q, ''));
  IF length(q) < 2 THEN RETURN; END IF;
  pat := '%' || replace(replace(replace(left(q, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  digits := regexp_replace(q, '\D', '', 'g');
  RETURN QUERY
    (SELECT 'account'::text, p.id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), concat_ws(', ', p.company, p.email), p.id
      FROM profiles p
      WHERE p.first_name ILIKE pat OR p.last_name ILIKE pat OR p.company ILIKE pat OR p.email ILIKE pat
        OR (trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))) ILIKE pat
        OR (length(digits) >= 4 AND p.account_number LIKE '%' || digits || '%')
      ORDER BY p.created_at DESC LIMIT 8)
    UNION ALL
    (SELECT 'invoices'::text, i.id, 'Invoice ' || i.number, concat_ws(', ', i.status, i.description), i.user_id
      FROM invoices i WHERE i.number ILIKE pat OR i.description ILIKE pat ORDER BY i.created_at DESC LIMIT 6)
    UNION ALL
    (SELECT 'support_tickets'::text, t.id, t.subject, t.status, t.user_id FROM support_tickets t WHERE t.subject ILIKE pat ORDER BY t.updated_at DESC LIMIT 6)
    UNION ALL
    (SELECT 'projects'::text, pr.id, pr.name, pr.status, pr.user_id FROM projects pr WHERE pr.name ILIKE pat ORDER BY pr.created_at DESC LIMIT 6)
    UNION ALL
    (SELECT 'tasks'::text, ta.id, ta.title, ta.status, ta.user_id FROM tasks ta WHERE ta.title ILIKE pat ORDER BY ta.created_at DESC LIMIT 6)
    UNION ALL
    (SELECT 'deliverables'::text, d.id, d.title, d.status, d.user_id FROM deliverables d WHERE d.title ILIKE pat ORDER BY d.created_at DESC LIMIT 6);
END $$;
REVOKE EXECUTE ON FUNCTION public.staff_search(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_search(text) TO authenticated;

-- ===================================================================================================
-- Two-factor sessions: once a user has a verified authenticator, a session that hasn't passed it (aal1) can read or change
-- nothing. Restrictive policies are ANDed with every other policy. Server functions check the same rule (requireSession).
-- ===================================================================================================
CREATE OR REPLACE FUNCTION public.mfa_session_ok() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    OR NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = auth.uid() AND f.status = 'verified') $$;
REVOKE EXECUTE ON FUNCTION public.mfa_session_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_session_ok() TO authenticated;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','user_roles','applications','application_events','subscriptions','projects','invoices','transactions',
    'support_tickets','crm_activities','ticket_messages','time_entries','compliance_requests','audit_log','contacts','tasks','invoice_charges',
    'billing_settings','staff_members','security_settings','notifications','documents','signed_agreements','deliverables','client_reports',
    'onboarding_briefs','message_templates'] LOOP
    EXECUTE format('CREATE POLICY "two-factor session" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_session_ok()) WITH CHECK (public.mfa_session_ok())', t);
  END LOOP;
END $$;
