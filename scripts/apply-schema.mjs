import { readFileSync } from 'node:fs';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));

const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const connectionString = process.env.DATABASE_URL || buildConnectionString();

if (!connectionString) {
  console.error('DATABASE_URL ausente e nao foi possivel montar a conexao pelo SUPABASE_URL/DATABASE_PW.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

try {
  await client.connect();
  await client.query(sql);
  console.log('Schema aplicado com sucesso.');
} finally {
  await client.end().catch(() => {});
}

function buildConnectionString() {
  const url = process.env.SUPABASE_URL || '';
  const password = process.env.DATABASE_PW || '';
  const match = url.match(/^https:\/\/([^.]+)\.supabase\.co/);
  if (!match || !password) return '';
  const ref = match[1];
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

function loadEnv(url) {
  const content = readFileSync(url, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] ||= rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
}
