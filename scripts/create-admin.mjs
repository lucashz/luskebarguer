import { readFileSync } from 'node:fs';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));

const name = process.env.ADMIN_SEED_NAME || 'Administrador';
const email = (process.env.ADMIN_SEED_EMAIL || 'admin@cardapio.local').trim().toLowerCase();
const generatedPassword = !process.env.ADMIN_SEED_PASSWORD;
const password = process.env.ADMIN_SEED_PASSWORD || generatePassword();
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
  await client.query(`
    insert into public.admin_users (name, email, password_hash, role, is_active)
    values ($1, $2, $3, 'owner', true)
    on conflict (email)
    do update set
      name = excluded.name,
      password_hash = excluded.password_hash,
      role = 'owner',
      is_active = true,
      updated_at = now()
  `, [name, email, hashPassword(password)]);

  console.log('Admin pronto para uso.');
  console.log(`Email: ${email}`);
  console.log(`Senha${generatedPassword ? ' gerada' : ''}: ${password}`);
  console.log('Troque a senha em /admin > Conta depois do primeiro login.');
} finally {
  await client.end().catch(() => {});
}

function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  const iterations = 310000;
  const digest = pbkdf2Sync(value, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$${iterations}$${salt}$${digest}`;
}

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = randomBytes(18);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
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
