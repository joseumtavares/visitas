ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS document_front_path   TEXT,
  ADD COLUMN IF NOT EXISTS document_back_path    TEXT,
  ADD COLUMN IF NOT EXISTS residence_proof_path  TEXT;
