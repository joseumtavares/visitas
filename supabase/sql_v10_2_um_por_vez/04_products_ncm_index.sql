CREATE INDEX IF NOT EXISTS idx_products_ncm
  ON public.products (workspace, ncm_code)
  WHERE ncm_code IS NOT NULL AND ncm_code <> '';
