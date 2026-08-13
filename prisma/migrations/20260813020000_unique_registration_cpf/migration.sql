-- Registros antigos sem documento permanecem válidos. A aplicação passa a exigir
-- CPF nos novos cadastros, enquanto os índices garantem a unicidade no banco.
CREATE UNIQUE INDEX IF NOT EXISTS "companies_document_key"
  ON "companies" ("document")
  WHERE "document" IS NOT NULL AND "document" <> '';

CREATE UNIQUE INDEX IF NOT EXISTS "customers_store_id_document_key"
  ON "customers" ("store_id", "document")
  WHERE "document" IS NOT NULL AND "document" <> '';
