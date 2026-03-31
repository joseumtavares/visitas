CREATE INDEX IF NOT EXISTS idx_visits_geo
  ON public.visits (workspace)
  WHERE lat <> 0 AND lng <> 0;
