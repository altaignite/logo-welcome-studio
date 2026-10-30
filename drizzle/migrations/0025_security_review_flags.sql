-- Softer signals (a mobile number shared with another account, several new accounts on one network) no longer restrict the
-- account: they open a Security review ticket for staff and alert them, and the client carries on. Staff can still restrict the
-- account (Fraud - KYC) from the account page. Card fraud warnings and chargebacks keep restricting through flag_for_kyc.
CREATE OR REPLACE FUNCTION public.flag_for_review(_user uuid, _reason text, _source text DEFAULT 'security check')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ticket uuid; subj text := 'Security review: ' || left(_source, 80);
BEGIN
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user AND role = 'admin') THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _user) THEN RETURN false; END IF;
  -- One open review per account and signal.
  IF EXISTS (SELECT 1 FROM support_tickets WHERE user_id = _user AND subject = subj AND status <> 'closed') THEN RETURN false; END IF;
  INSERT INTO support_tickets (user_id, subject, category, department, priority, status)
    VALUES (_user, subj, 'general', 'security', 'high', 'open') RETURNING id INTO ticket;
  INSERT INTO ticket_messages (ticket_id, user_id, body, internal, actor_label)
    VALUES (ticket, _user, 'Automatic security review (' || left(_source, 80) || '): ' || left(_reason, 1500) ||
      E'\n\nThe account has not been restricted. Check the application and account details. If something is wrong, request more information or set the account to Fraud - KYC; otherwise close this ticket.', true, 'Security');
  PERFORM public.log_security_event('account_review', 'medium', 'review:' || _user || ':' || left(_source, 60), NULL, NULL, _user, '/admin/accounts/' || _user,
    jsonb_build_object('summary', left(_reason, 300), 'source', _source));
  PERFORM notify_staff('accounts', NULL, 'security', 'Account to review: ' || left(_source, 60), left(_reason, 300), '/admin/accounts/' || _user, 'review:' || _user || ':' || _source);
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.flag_for_review(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flag_for_review(uuid, text, text) TO service_role;

-- Duplicate mobile numbers now open a review instead of restricting the account.
CREATE OR REPLACE FUNCTION public.check_duplicate_phone() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE other uuid; acct text;
BEGIN
  other := public.duplicate_phone_owner(NEW.id);
  IF other IS NOT NULL THEN
    SELECT account_number INTO acct FROM profiles WHERE id = other;
    PERFORM public.flag_for_review(NEW.id, 'The mobile number on this account is also used by account ' || coalesce(acct, other::text) || '. This can be an owner with two businesses or a shared office phone; check that the details add up.', 'shared mobile number');
  END IF;
  RETURN NULL;
END $$;
