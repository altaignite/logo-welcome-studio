-- Fraud - KYC: accounts flagged by security checks can sign in only to see the verification page; every table is closed to
-- them by the "active account" policy. One function flags an account, opens an urgent Security ticket and alerts staff.

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_department_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_department_check
  CHECK (department IN ('account','billing','technical','projects','marketing','complaints','security'));

-- Restricted accounts lose data access like suspended and closed ones.
CREATE OR REPLACE FUNCTION public.account_access_ok() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NULL
    OR EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
    OR NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.status IN ('suspended','closed','fraud_kyc')) $$;

-- Digits only, so "+31 6 1234 5678" and "+31612345678" match.
CREATE OR REPLACE FUNCTION public.phone_digits(_phone text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT nullif(regexp_replace(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), '^00', ''), '') $$;
CREATE INDEX IF NOT EXISTS profiles_phone_digits_idx ON public.profiles (public.phone_digits(phone));

-- Flags an account for KYC review. Idempotent: an account already flagged or closed is left alone. Returns true when flagged.
CREATE OR REPLACE FUNCTION public.flag_for_kyc(_user uuid, _reason text, _source text DEFAULT 'security check')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prev text; ticket uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user AND role = 'admin') THEN RETURN false; END IF;
  SELECT status INTO prev FROM profiles WHERE id = _user FOR UPDATE;
  IF prev IS NULL OR prev IN ('fraud_kyc', 'closed') THEN RETURN false; END IF;
  UPDATE profiles SET status = 'fraud_kyc', status_reason = left(_reason, 500), status_changed_at = now(), updated_at = now() WHERE id = _user;
  INSERT INTO support_tickets (user_id, subject, category, department, priority, status)
    VALUES (_user, 'KYC review: account restricted by ' || left(_source, 80), 'general', 'security', 'urgent', 'open')
    RETURNING id INTO ticket;
  INSERT INTO ticket_messages (ticket_id, user_id, body, internal, actor_label)
    VALUES (ticket, _user, 'Automatic security flag (' || left(_source, 80) || '): ' || left(_reason, 1500) ||
      E'\n\nThe client has been asked to email proof of identity and proof of residence (not older than 3 months) to kyc@firstpersonmarketing.com. Review the documents, then set the account back to Active to reinstate it, or close it.', true, 'Security');
  INSERT INTO audit_log (account_id, table_name, record_id, action, changes, actor_label)
    VALUES (_user, 'profiles', _user, 'status_changed', jsonb_build_object('status', jsonb_build_object('from', prev, 'to', 'fraud_kyc'), 'reason', _reason, 'source', _source), 'Security');
  PERFORM notify_staff('accounts', NULL, 'security', 'Account restricted for KYC review', left(_reason, 300), '/admin/accounts/' || _user, 'kyc:' || _user || ':' || now()::date);
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.flag_for_kyc(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flag_for_kyc(uuid, text, text) TO service_role;

-- Another (not closed) account already using this mobile number.
CREATE OR REPLACE FUNCTION public.duplicate_phone_owner(_user uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id FROM profiles me JOIN profiles o ON public.phone_digits(o.phone) = public.phone_digits(me.phone) AND o.id <> me.id
  WHERE me.id = _user AND length(public.phone_digits(me.phone)) >= 7 AND o.status <> 'closed'
    AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = o.id AND r.role = 'admin')
  ORDER BY o.created_at LIMIT 1 $$;
REVOKE EXECUTE ON FUNCTION public.duplicate_phone_owner(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_phone_owner(uuid) TO service_role;

-- New accounts (signup) and phone changes: the later account with a duplicate number is flagged.
CREATE OR REPLACE FUNCTION public.check_duplicate_phone() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE other uuid; acct text;
BEGIN
  other := public.duplicate_phone_owner(NEW.id);
  IF other IS NOT NULL THEN
    SELECT account_number INTO acct FROM profiles WHERE id = other;
    PERFORM public.flag_for_kyc(NEW.id, 'This account was flagged due to duplication of phone number: the mobile number is already used by account ' || coalesce(acct, other::text) || '.', 'duplicate phone number');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS profiles_duplicate_phone ON public.profiles;
CREATE TRIGGER profiles_duplicate_phone AFTER INSERT OR UPDATE OF phone ON public.profiles
  FOR EACH ROW WHEN (NEW.phone IS NOT NULL) EXECUTE FUNCTION public.check_duplicate_phone();
