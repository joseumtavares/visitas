CREATE INDEX IF NOT EXISTS idx_products_finame
  ON public.products (workspace, finame_code)
  WHERE finame_code IS NOT NULL AND finame_code <> '';
