import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

loadEnv(new URL('../.env', import.meta.url));

const connectionString = pgDumpConnectionString(process.env.DATABASE_URL || '');

if (!connectionString) {
  console.error('DATABASE_URL ausente.');
  process.exit(1);
}

const backupsDir = path.resolve(process.env.BACKUP_DIR || 'backups');
const retentionDays = Number.parseInt(process.env.BACKUP_RETENTION_DAYS || '14', 10);
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
    cleanupOldBackups().catch((error) => {
      console.error(`Backup criado, mas a limpeza de backups antigos falhou: ${error.message || error}`);
      process.exit(1);
    });
    return;
  }
  console.error('Falha ao executar pg_dump. Verifique se o PostgreSQL client esta instalado.');
  process.exit(code || 1);
});

function pgDumpConnectionString(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.searchParams.delete('schema');
    return url.toString();
  } catch {
    return value.replace(/([?&])schema=[^&]*&?/, (match, prefix) => prefix === '?' ? '?' : '').replace(/[?&]$/, '');
  }
}

async function cleanupOldBackups() {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = await readdir(backupsDir).catch(() => []);
  for (const entry of entries) {
    if (!/^postgres-.+\.dump$/.test(entry)) continue;
    const fullPath = path.join(backupsDir, entry);
    const info = await stat(fullPath).catch(() => null);
    if (info && info.mtimeMs < cutoff) {
      await unlink(fullPath);
      console.log(`Backup antigo removido: ${fullPath}`);
    }
  }
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
