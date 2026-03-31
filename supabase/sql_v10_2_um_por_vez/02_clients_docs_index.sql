CREATE INDEX IF NOT EXISTS idx_clients_docs
  ON public.clients (workspace)
  WHERE document_front_path  IS NOT NULL
     OR document_back_path   IS NOT NULL
     OR residence_proof_path IS NOT NULL;
