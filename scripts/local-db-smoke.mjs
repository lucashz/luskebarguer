import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const result = await client.query('select 1 as ok');
  if (result.rows[0]?.ok !== 1) throw new Error('Resposta inesperada do banco.');
  const expected = await client.query('select id from "_prisma_migrations" order by id asc limit 1 offset 1');
  const { localPostgrestRequest, closeLocalPool } = await import('../src/lib/local-postgrest-adapter.js');
  const projected = await localPostgrestRequest('GET', '_prisma_migrations', {
    select: 'id', order: 'id.asc', limit: '1', offset: '1'
  });
  if (projected[0]?.id !== expected.rows[0]?.id) throw new Error('Paginação offset do adaptador está incorreta.');
  if (projected[0] && Object.keys(projected[0]).join(',') !== 'id') throw new Error('Projeção select do adaptador está incorreta.');
  const provenanceColumns = await client.query(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'companies'
      and column_name = any($1::text[])
  `, [[
    'creation_source', 'creation_purpose', 'created_by_admin_id',
    'created_by_name_snapshot', 'creation_note', 'creation_metadata',
    'last_customer_login_at'
  ]]);
  if (provenanceColumns.rowCount !== 7) throw new Error('Colunas de proveniência de cadastro ausentes.');
  const creatorForeignKey = await client.query(`
    select rc.delete_rule
    from information_schema.referential_constraints rc
    where rc.constraint_schema = 'public'
      and rc.constraint_name = 'companies_created_by_admin_id_fkey'
  `);
  if (creatorForeignKey.rows[0]?.delete_rule !== 'SET NULL') throw new Error('FK do criador precisa usar ON DELETE SET NULL.');
  const provenanceIndexes = await client.query(`
    select indexname from pg_indexes
    where schemaname = 'public' and tablename = 'companies'
      and indexname = any($1::text[])
  `, [[
    'companies_creation_source_idx', 'companies_creation_purpose_idx',
    'companies_created_by_admin_id_idx', 'companies_last_customer_login_at_idx'
  ]]);
  if (provenanceIndexes.rowCount !== 4) throw new Error('Índices de proveniência de cadastro ausentes.');
  await client.query('begin');
  try {
    const operator = (await client.query(`
      insert into admin_users (name, email, password_hash, role)
      values ('Operador efêmero', $1, 'not-used', 'admin') returning id
    `, [`provenance-${Date.now()}@example.test`])).rows[0];
    const company = (await client.query(`
      insert into companies (name, creation_source, creation_purpose, created_by_admin_id, created_by_name_snapshot, creation_note, creation_metadata)
      values ('Fixture de proveniência', 'platform_admin', 'internal_test', $1, 'Operador efêmero', 'Teste local', '{}'::jsonb)
      returning id
    `, [operator.id])).rows[0];
    await client.query('delete from admin_users where id = $1', [operator.id]);
    const preserved = (await client.query('select created_by_admin_id, created_by_name_snapshot from companies where id = $1', [company.id])).rows[0];
    if (preserved.created_by_admin_id !== null || preserved.created_by_name_snapshot !== 'Operador efêmero') {
      throw new Error('Exclusão do operador não preservou o retrato textual do criador.');
    }
  } finally {
    await client.query('rollback');
  }
  await closeLocalPool();
  console.log('Banco local respondeu com sucesso.');
} finally {
  await client.end().catch(() => {});
}

function loadEnv(url) {
  if (!existsSync(url)) return;
  const content = readFileSync(url, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] ||= rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
}
