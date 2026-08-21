import { readFileSync } from 'node:fs';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));

const email = String(process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
const name = String(process.env.PLATFORM_ADMIN_NAME || '').trim();
const connectionString = process.env.DATABASE_URL || '';

if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('PLATFORM_ADMIN_EMAIL inválido.');
if (!name) throw new Error('PLATFORM_ADMIN_NAME obrigatório.');
if (!connectionString) throw new Error('DATABASE_URL ausente.');

const client = new pg.Client({ connectionString });
try {
  await client.connect();
  const existing = (await client.query('select id, role, is_active from public.admin_users where lower(email)=lower($1) limit 1', [email])).rows[0];
  if (existing && existing.role !== 'superadmin') throw new Error('O e-mail já pertence a uma conta comum; promoção automática bloqueada.');
  if (existing) {
    await client.query('update public.admin_users set name=$1,is_active=true,updated_at=now() where id=$2', [name, existing.id]);
    console.log(JSON.stringify({ status: 'already_exists', id: existing.id, email, role: existing.role, active: true }));
  } else {
    const passwordHash = hashPassword(randomBytes(48).toString('base64url'));
    const created = (await client.query(`insert into public.admin_users(name,email,password_hash,role,is_active) values($1,$2,$3,'superadmin',true) returning id,role,is_active`, [name, email, passwordHash])).rows[0];
    console.log(JSON.stringify({ status: 'created', id: created.id, email, role: created.role, active: created.is_active }));
  }
} finally {
  await client.end().catch(() => {});
}

function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  const iterations = 310000;
  const digest = pbkdf2Sync(value, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$${iterations}$${salt}$${digest}`;
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
