import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente.');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const tables = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name in ('payment_attempts', 'payment_refunds')
  `);
  if (tables.rowCount !== 2) throw new Error('Tabelas de tentativas e estornos não foram criadas.');

  const indexes = await client.query(`
    select indexname from pg_indexes
    where schemaname = 'public' and indexname in (
      'payment_attempts_idempotency_key_key',
      'payment_attempts_provider_transaction_id_key',
      'payment_refunds_idempotency_key_key'
    )
  `);
  if (indexes.rowCount !== 3) throw new Error('Índices de idempotência de pagamentos incompletos.');

  const invalid = await client.query(`
    select count(*)::int as count from payment_attempts where amount_cents < 0 or currency <> 'BRL'
  `);
  if (invalid.rows[0].count) throw new Error('Foram encontradas tentativas financeiras inválidas.');
  console.log('Estrutura endurecida de pagamentos validada com sucesso.');
} finally {
  await client.end().catch(() => {});
}

function loadEnv(url) {
  if (!existsSync(url)) return;
  for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] ||= rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
}
