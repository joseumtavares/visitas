SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('clients', 'products', 'visits')
  AND column_name IN (
    'document_front_path', 'document_back_path', 'residence_proof_path',
    'finame_code', 'ncm_code',
    'activity_type', 'lat', 'lng'
  )
ORDER BY table_name, column_name;
