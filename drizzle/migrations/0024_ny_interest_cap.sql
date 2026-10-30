-- New York civil usury cap (16% a year): interest compounds monthly, so 1.24% a month is the most allowed.
UPDATE public.billing_settings SET monthly_interest_pct = 1.24 WHERE monthly_interest_pct > 1.24;
ALTER TABLE public.billing_settings ALTER COLUMN monthly_interest_pct SET DEFAULT 1.24;
ALTER TABLE public.billing_settings DROP CONSTRAINT IF EXISTS billing_settings_ny_interest_cap;
ALTER TABLE public.billing_settings ADD CONSTRAINT billing_settings_ny_interest_cap CHECK (monthly_interest_pct >= 0 AND monthly_interest_pct <= 1.24);
