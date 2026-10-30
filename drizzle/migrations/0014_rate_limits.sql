-- Server-side rate limits (rules in src/lib/limits.ts). Counted per key in fixed windows; only server code (service role) uses them.
CREATE TABLE public.rate_limit_hits (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count int NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
GRANT ALL ON public.rate_limit_hits TO service_role;
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;

-- Counts one hit and says whether it's within the limit. Atomic, so parallel requests can't slip past.
CREATE OR REPLACE FUNCTION public.hit_rate_limit(_key text, _max int, _window_seconds int) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w timestamptz := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds); n int;
BEGIN
  INSERT INTO rate_limit_hits (key, window_start, count) VALUES (left(_key, 200), w, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_hits.count + 1
  RETURNING count INTO n;
  RETURN n <= _max;
END $$;
REVOKE EXECUTE ON FUNCTION public.hit_rate_limit(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hit_rate_limit(text, int, int) TO service_role;
