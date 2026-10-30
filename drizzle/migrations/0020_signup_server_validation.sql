-- Server-side signup validation: the signup API can be called without the signup page, so names, business, country, mobile
-- number and plan are checked here too (a missing number would also dodge the duplicate-number fraud check).

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
  -- A signup (anything carrying a plan or client details) must pass the same rules as the signup page, because the signup API
  -- can be called directly. Invited staff accounts carry no metadata and skip this.
  IF m ? 'plan_id' OR m ? 'phone' OR m ? 'first_name' THEN
    IF length(trim(coalesce(m->>'first_name', ''))) NOT BETWEEN 1 AND 80 OR length(trim(coalesce(m->>'last_name', ''))) NOT BETWEEN 1 AND 80 THEN
      RAISE EXCEPTION 'Enter your first and last name.' USING ERRCODE = 'check_violation';
    END IF;
    IF length(trim(coalesce(m->>'company', ''))) NOT BETWEEN 1 AND 160 THEN
      RAISE EXCEPTION 'Enter your business name.' USING ERRCODE = 'check_violation';
    END IF;
    IF coalesce(m->>'country', '') !~ '^[A-Z]{2}$' THEN
      RAISE EXCEPTION 'Choose your country.' USING ERRCODE = 'check_violation';
    END IF;
    IF coalesce(m->>'phone', '') !~ '^\+[0-9 ]{7,24}$' OR length(public.phone_digits(m->>'phone')) NOT BETWEEN 7 AND 15 THEN
      RAISE EXCEPTION 'Enter a valid mobile number in international format.' USING ERRCODE = 'check_violation';
    END IF;
    IF m->>'plan_id' IS NULL OR m->>'plan_id' NOT IN ('starter', 'growth', 'scale') THEN
      RAISE EXCEPTION 'Choose a plan.' USING ERRCODE = 'check_violation';
    END IF;
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
  VALUES (new.id, acct, left(trim(m->>'first_name'), 80), left(trim(m->>'last_name'), 80), left(trim(m->>'company'), 160), m->>'country', m->>'phone', new.email,
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
