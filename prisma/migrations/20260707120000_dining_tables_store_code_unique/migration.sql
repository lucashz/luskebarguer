-- Allow different stores to use the same public table code, while keeping
-- table QR codes unique inside each store.
DROP INDEX IF EXISTS "dining_tables_code_key";

CREATE UNIQUE INDEX IF NOT EXISTS "dining_tables_store_id_code_key" ON "dining_tables"("store_id", "code");
