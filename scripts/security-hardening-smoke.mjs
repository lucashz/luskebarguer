import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente para o teste de seguranca.');

const port = Number(process.env.SECURITY_HARDENING_PORT || 4300 + Math.floor(Math.random() * 300));
const baseUrl = `http://127.0.0.1:${port}`;
let child;

export async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

export async function startServer() {
  const processChild = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      APP_URL: baseUrl,
      PUBLIC_APP_URL: baseUrl,
      COOKIE_SECURE: 'false',
      NODE_ENV: 'test',
      SKIP_SIGNUP_ACTIVATION_EMAIL: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  processChild.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  processChild.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (processChild.exitCode !== null) throw new Error(`Servidor encerrou durante o boot.\n${logs}`);
    try {
      const health = await fetch(`${baseUrl}/api/health`);
      if (health.ok) return processChild;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  processChild.kill();
  throw new Error(`Servidor nao respondeu em ${baseUrl}.\n${logs}`);
}

export async function withSyntheticTenant(callback) {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false
  });
  await client.connect();
  await client.query('begin');
  try {
    return await callback(client);
  } finally {
    await client.query('rollback').catch(() => {});
    await client.end().catch(() => {});
  }
}

try {
  child = await startServer();
  const health = await request('/api/health');
  assert.equal(health.response.status, 200);
  console.log('Security hardening smoke: base HTTP OK');
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
  }
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

function shouldUseSsl(value) {
  return process.env.DB_SSL === 'true' || /sslmode=require/i.test(String(value || ''));
}
