CREATE INDEX IF NOT EXISTS idx_visits_activity
  ON public.visits (workspace, client_id, activity_type);
