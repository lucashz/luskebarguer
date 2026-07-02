import { mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

loadEnv(new URL('../.env', import.meta.url));

const connectionString = process.env.DATABASE_URL || '';

if (!connectionString) {
  console.error('DATABASE_URL ausente.');
  process.exit(1);
}

const backupsDir = path.resolve('backups');
await mkdir(backupsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(backupsDir, `postgres-${stamp}.dump`);

const child = spawn('pg_dump', [
  '--format=custom',
  '--no-owner',
  '--no-privileges',
  '--file',
  output,
  connectionString
], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

child.on('exit', (code) => {
  if (code === 0) {
    console.log(`Backup criado em ${output}`);
    return;
  }
  console.error('Falha ao executar pg_dump. Verifique se o PostgreSQL client esta instalado.');
  process.exit(code || 1);
});

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

