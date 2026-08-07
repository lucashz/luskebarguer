-- Store only one-way hashes of bearer session tokens. Existing browser cookies
-- continue to work because the server hashes their raw value before lookup.
UPDATE app_sessions
SET token = encode(digest(token, 'sha256'), 'hex')
WHERE token !~ '^[0-9a-f]{64}$';

-- Public order codes are security-sensitive lookup keys. Prevent even an
-- extremely unlikely collision from resolving a request to the wrong order.
CREATE UNIQUE INDEX IF NOT EXISTS orders_public_code_key
ON orders (public_code);
