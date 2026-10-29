CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE m jsonb := new.raw_user_meta_data; acct text; app_id uuid; sub_id uuid;
  p_id text; p_name text; p_fee int; p_hours int;
BEGIN
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