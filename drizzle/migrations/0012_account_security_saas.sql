-- Account security and SaaS hardening: disposable email blocking, session control, suspended accounts locked out at the
-- database, sign-in locations, ticket departments with server-only client writes, live Stripe status and guarantee tracking.

-- ===================================================================================================
-- Disposable email domains (list mirrors src/lib/disposable-domains.ts; staff can add more).
-- ===================================================================================================
CREATE TABLE public.blocked_email_domains (
  domain text PRIMARY KEY CHECK (domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  reason text NOT NULL DEFAULT 'Disposable email provider',
  created_by_label text NOT NULL DEFAULT 'System',
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.blocked_email_domains (domain) VALUES
  ('0-mail.com'),
  ('10minutemail.com'),
  ('10minutemail.net'),
  ('20minutemail.com'),
  ('33mail.com'),
  ('anonaddy.com'),
  ('anonbox.net'),
  ('burnermail.io'),
  ('byom.de'),
  ('chacuo.net'),
  ('cock.li'),
  ('crazymailing.com'),
  ('deadaddress.com'),
  ('discard.email'),
  ('discardmail.com'),
  ('dispostable.com'),
  ('dropmail.me'),
  ('dumpmail.de'),
  ('easytrashmail.com'),
  ('emailondeck.com'),
  ('emailfake.com'),
  ('emltmp.com'),
  ('fakeinbox.com'),
  ('fakemail.net'),
  ('fakemailgenerator.com'),
  ('fexbox.org'),
  ('getairmail.com'),
  ('getnada.com'),
  ('guerrillamail.biz'),
  ('guerrillamail.com'),
  ('guerrillamail.de'),
  ('guerrillamail.info'),
  ('guerrillamail.net'),
  ('guerrillamail.org'),
  ('guerrillamailblock.com'),
  ('harakirimail.com'),
  ('inboxbear.com'),
  ('inboxkitten.com'),
  ('incognitomail.org'),
  ('jetable.org'),
  ('mail-temp.com'),
  ('mail.tm'),
  ('mail7.io'),
  ('mailcatch.com'),
  ('maildrop.cc'),
  ('mailinator.com'),
  ('mailinator.net'),
  ('mailinator2.com'),
  ('mailnesia.com'),
  ('mailpoof.com'),
  ('mailsac.com'),
  ('mailtemp.info'),
  ('mintemail.com'),
  ('mohmal.com'),
  ('moakt.com'),
  ('mytemp.email'),
  ('mytrashmail.com'),
  ('nada.email'),
  ('neverbox.com'),
  ('nwytg.net'),
  ('owlymail.com'),
  ('pokemail.net'),
  ('rcpt.at'),
  ('sharklasers.com'),
  ('spam4.me'),
  ('spambog.com'),
  ('spambox.us'),
  ('spamgourmet.com'),
  ('spamex.com'),
  ('spamfree24.org'),
  ('spaml.de'),
  ('temp-mail.io'),
  ('temp-mail.org'),
  ('tempail.com'),
  ('tempinbox.com'),
  ('tempmail.com'),
  ('tempmail.dev'),
  ('tempmail.net'),
  ('tempmail.plus'),
  ('tempmailo.com'),
  ('tempr.email'),
  ('tempmailaddress.com'),
  ('throwawaymail.com'),
  ('tmail.ws'),
  ('tmailor.com'),
  ('tmpmail.net'),
  ('tmpmail.org'),
  ('trash-mail.com'),
  ('trashmail.com'),
  ('trashmail.de'),
  ('trashmail.net'),
  ('trashmail.ws'),
  ('trbvm.com'),
  ('wegwerfmail.de'),
  ('wegwerfmail.net'),
  ('yopmail.com'),
  ('yopmail.fr'),
  ('yopmail.net'),
  ('zetmail.com'),
  ('emailnax.com'),
  ('minuteinbox.com'),
  ('linshiyouxiang.net'),
  ('1secmail.com'),
  ('1secmail.net'),
  ('1secmail.org'),
  ('esiix.com'),
  ('wwjmp.com'),
  ('xojxe.com'),
  ('yoggm.com'),
  ('kzccv.com'),
  ('qiott.com'),
  ('vjuum.com'),
  ('laafd.com'),
  ('txcct.com'),
  ('dpptd.com'),
  ('bheps.com'),
  ('rteet.com'),
  ('dcctb.com'),
  ('mailto.plus'),
  ('fextemp.com'),
  ('any.pink'),
  ('merepost.com'),
  ('simplelogin.co')
ON CONFLICT DO NOTHING;
GRANT SELECT, INSERT, DELETE ON public.blocked_email_domains TO authenticated;
GRANT ALL ON public.blocked_email_domains TO service_role;
ALTER TABLE public.blocked_email_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read blocked domains" ON public.blocked_email_domains FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "staff add blocked domains" ON public.blocked_email_domains FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(), 'accounts'));
CREATE POLICY "staff remove blocked domains" ON public.blocked_email_domains FOR DELETE TO authenticated USING (public.has_perm(auth.uid(), 'accounts'));

CREATE OR REPLACE FUNCTION public.email_domain_blocked(_email text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM blocked_email_domains b, lower(split_part(coalesce(_email, ''), '@', 2)) AS d(dom)
    WHERE d.dom = b.domain OR d.dom LIKE '%.' || b.domain) $$;
REVOKE EXECUTE ON FUNCTION public.email_domain_blocked(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_domain_blocked(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE m jsonb := new.raw_user_meta_data; acct text; app_id uuid; sub_id uuid;
  p_id text; p_name text; p_fee int; p_hours int;
BEGIN
  -- Disposable addresses are refused on the server, whatever the signup page does.
  IF public.email_domain_blocked(new.email) THEN
    RAISE EXCEPTION 'Disposable email addresses can''t be used. Please sign up with your business or personal email.' USING ERRCODE = 'check_violation';
  END IF;
  acct := coalesce(m->>'account_number', '');
  IF acct !~ '^\d{10}$' OR EXISTS (SELECT 1 FROM profiles WHERE account_number = acct) THEN
    LOOP
      acct := lpad((floor(random()*9000000000)+1000000000)::bigint::text, 10, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE account_number = acct);
    END LOOP;
  END IF;
  p_id := m->>'plan_id';
  SELECT v.n, v.f, v.h INTO p_name, p_fee, p_hours FROM (VALUES
    ('starter','Starter',199,5),('growth','Growth',499,15),('scale','Scale',999,35)) v(i,n,f,h)
    WHERE v.i = p_id;
  IF p_id IS NOT NULL AND p_name IS NULL THEN p_id := NULL; END IF;
  INSERT INTO profiles(id, account_number, first_name, last_name, company, country, phone, email, terms_accepted_at)
  VALUES (new.id, acct, m->>'first_name', m->>'last_name', m->>'company', m->>'country', m->>'phone', new.email,
    CASE WHEN p_id IS NOT NULL THEN now() END);
  IF p_id IS NOT NULL THEN
    INSERT INTO applications(user_id, account_number, plan_id, plan_name, monthly_fee, monthly_hours, signed_at)
    VALUES (new.id, acct, p_id, p_name, p_fee, p_hours, now()) RETURNING id INTO app_id;
    INSERT INTO application_events(application_id, actor_label, action, to_status, note)
    VALUES (app_id, 'Applicant', 'Application submitted and digitally signed', 'submitted', 'Plan: ' || p_name);
    INSERT INTO subscriptions(user_id, plan_name, monthly_fee, monthly_hours, status, application_id)
    VALUES (new.id, p_name, p_fee, p_hours, 'pending', app_id) RETURNING id INTO sub_id;
    INSERT INTO projects(user_id, name, service, status, subscription_id, description)
    VALUES (new.id, COALESCE(NULLIF(m->>'company',''), trim(coalesce(m->>'first_name','') || ' ' || coalesce(m->>'last_name',''))),
      'Marketing', 'planned', sub_id, p_name || ' plan');
  END IF;
  RETURN new;
END $function$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Email changes to a blocked domain are refused when they're confirmed.
CREATE OR REPLACE FUNCTION public.sync_profile_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.email_domain_blocked(NEW.email) THEN
    RAISE EXCEPTION 'Disposable email addresses can''t be used.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.profiles SET email = NEW.email, updated_at = now() WHERE id = NEW.id;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.sync_profile_email() FROM PUBLIC, anon, authenticated;

-- ===================================================================================================
-- Sessions: staff can list a user's sessions; revoking runs from server functions only (service role).
-- ===================================================================================================
CREATE OR REPLACE FUNCTION public.user_sessions(_user uuid) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT to_jsonb(s) FROM auth.sessions s WHERE s.user_id = _user ORDER BY s.created_at DESC LIMIT 100;
END $$;
REVOKE EXECUTE ON FUNCTION public.user_sessions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_sessions(uuid) TO authenticated;

-- Ends one session or all of them; refresh tokens go with their sessions, so the user is signed out everywhere.
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(_user uuid, _session uuid DEFAULT NULL) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  DELETE FROM auth.sessions WHERE user_id = _user AND (_session IS NULL OR id = _session);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF _session IS NULL THEN DELETE FROM auth.refresh_tokens WHERE user_id = _user::text; END IF;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.revoke_user_sessions(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid, uuid) TO service_role;

-- ===================================================================================================
-- Suspended and closed accounts can't read or change anything, even with a token issued before the change.
-- ===================================================================================================
CREATE OR REPLACE FUNCTION public.account_access_ok() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NULL
    OR EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
    OR NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.status IN ('suspended','closed')) $$;
REVOKE EXECUTE ON FUNCTION public.account_access_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_access_ok() TO authenticated;

-- ===================================================================================================
-- Sign-in history with new-location flags (recorded by requireSession from the request's network location).
-- ===================================================================================================
CREATE TABLE public.sign_in_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid UNIQUE,
  ip text,
  country text,
  region text,
  city text,
  user_agent text,
  new_location boolean NOT NULL DEFAULT false,
  reviewed_at timestamptz,
  reviewed_by_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.sign_in_events (user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.sign_in_events TO authenticated;
GRANT ALL ON public.sign_in_events TO service_role;
ALTER TABLE public.sign_in_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or staff sign-ins" ON public.sign_in_events FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "staff review sign-ins" ON public.sign_in_events FOR UPDATE TO authenticated
  USING (public.has_perm(auth.uid(), 'accounts')) WITH CHECK (public.has_perm(auth.uid(), 'accounts'));

-- Staff may only mark a sign-in reviewed.
CREATE OR REPLACE FUNCTION public.guard_sign_in_event() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (NEW.user_id, NEW.session_id, NEW.ip, NEW.country, NEW.region, NEW.city, NEW.user_agent, NEW.new_location, NEW.created_at)
    IS DISTINCT FROM (OLD.user_id, OLD.session_id, OLD.ip, OLD.country, OLD.region, OLD.city, OLD.user_agent, OLD.new_location, OLD.created_at) THEN
    RAISE EXCEPTION 'Sign-in records can only be marked reviewed.';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_sign_in_event() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sign_in_event_guard BEFORE UPDATE ON public.sign_in_events FOR EACH ROW EXECUTE FUNCTION public.guard_sign_in_event();

CREATE OR REPLACE FUNCTION public.notify_sign_in() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE place text := coalesce(nullif(concat_ws(', ', NEW.city, NEW.region, NEW.country), ''), NEW.ip, 'an unknown location');
  who text;
BEGIN
  IF NOT NEW.new_location THEN RETURN NEW; END IF;
  SELECT coalesce(nullif(company, ''), trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), email) INTO who FROM profiles WHERE id = NEW.user_id;
  PERFORM notify_staff('accounts', (SELECT account_manager FROM profiles WHERE id = NEW.user_id), 'security',
    'New sign-in location: ' || coalesce(who, 'a user'), place, '/admin/accounts/' || NEW.user_id, 'signin:' || NEW.id);
  PERFORM notify(NEW.user_id, 'security', 'New sign-in from ' || place,
    'If this wasn''t you, change your password and sign out of all devices under Security.', '/dashboard/security', true, 'signin:' || NEW.id);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_sign_in() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sign_in_notify AFTER INSERT ON public.sign_in_events FOR EACH ROW EXECUTE FUNCTION public.notify_sign_in();

-- ===================================================================================================
-- Support tickets: departments, contact preference and a related project. Clients write only through server functions.
-- ===================================================================================================
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'account' CHECK (department IN ('account','billing','technical','projects','marketing','complaints')),
  ADD COLUMN IF NOT EXISTS contact_preference text NOT NULL DEFAULT 'dashboard' CHECK (contact_preference IN ('dashboard','email','phone')),
  ADD COLUMN IF NOT EXISTS contact_phone text CHECK (contact_phone IS NULL OR length(contact_phone) <= 40),
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
UPDATE public.support_tickets SET department = CASE category WHEN 'billing' THEN 'billing' WHEN 'technical' THEN 'technical' WHEN 'project' THEN 'projects' WHEN 'complaint' THEN 'complaints' ELSE 'account' END;
DROP POLICY IF EXISTS "client open ticket" ON public.support_tickets;
DROP POLICY IF EXISTS "client reply open ticket" ON public.ticket_messages;

-- ===================================================================================================
-- Live Stripe status and guarantee tracking.
-- ===================================================================================================
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_status text,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS guarantee_claimed_at timestamptz;
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_status text,
  ADD COLUMN IF NOT EXISTS stripe_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_payment_at timestamptz;
-- Invoices that already went overdue count as failed for the guarantee.
UPDATE public.invoices SET failed_payment_at = coalesce(stage_changed_at, now()) WHERE failed_payment_at IS NULL AND (status IN ('overdue','uncollectible') OR collection_stage <> 'none');

-- ===================================================================================================
-- Restrictive rules on every table: two-factor sessions (new tables) and active accounts (all tables).
-- ===================================================================================================
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['blocked_email_domains','sign_in_events'] LOOP
    EXECUTE format('CREATE POLICY "two-factor session" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_session_ok()) WITH CHECK (public.mfa_session_ok())', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['profiles','user_roles','applications','application_events','subscriptions','projects','invoices','transactions','support_tickets','crm_activities','ticket_messages','time_entries','compliance_requests','audit_log','contacts','tasks','invoice_charges','billing_settings','staff_members','security_settings','notifications','documents','signed_agreements','deliverables','client_reports','onboarding_briefs','message_templates','blocked_email_domains','sign_in_events'] LOOP
    EXECUTE format('CREATE POLICY "active account" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.account_access_ok()) WITH CHECK (public.account_access_ok())', t);
  END LOOP;
END $$;

-- Plans paused because the account was put on hold or suspended are resumed when the account becomes active again.
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS paused_by_account_status boolean NOT NULL DEFAULT false;
