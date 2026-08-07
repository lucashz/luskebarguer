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
