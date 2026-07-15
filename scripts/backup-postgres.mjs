import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
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
const statusFile = path.join(backupsDir, 'backup-status.json');

try {
  await writeBackupStatus({ status: 'running', started_at: new Date().toISOString(), output: path.basename(output) });
  const code = await runPgDump(output);
  if (code !== 0) {
    throw new Error('Falha ao executar pg_dump. Verifique se o PostgreSQL client esta instalado.');
  }
  const info = await stat(output);
  await cleanupOldBackups();
  await writeBackupStatus({
    status: 'success',
    started_at: new Date(stampToDate(stamp)).toISOString(),
    finished_at: new Date().toISOString(),
    output: path.basename(output),
    size_bytes: info.size,
    retention_days: retentionDays
  });
  console.log(`Backup criado em ${output}`);
} catch (error) {
  await writeBackupStatus({
    status: 'failed',
    finished_at: new Date().toISOString(),
    output: path.basename(output),
    error: error.message || String(error),
    retention_days: retentionDays
  }).catch(() => {});
  console.error(error.message || error);
  process.exit(1);
}

function runPgDump(outputFile) {
  return new Promise((resolve) => {
    const child = spawn(resolveExecutable('pg_dump'), [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file',
      outputFile,
      connectionString
    ], {
      stdio: 'inherit',
      shell: false
    });
    child.on('exit', (code) => resolve(code || 0));
    child.on('error', () => resolve(1));
  });
}

function resolveExecutable(command) {
  if (process.platform !== 'win32' || path.isAbsolute(command) || command.includes(path.sep)) {
    return command;
  }
  const lookup = spawnSync('where.exe', [command], { encoding: 'utf8', shell: false });
  const first = String(lookup.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return first || command;
}

async function writeBackupStatus(data) {
  await writeFile(statusFile, JSON.stringify({
    ...data,
    updated_at: new Date().toISOString()
  }, null, 2));
}

function stampToDate(value) {
  return value.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2}).+$/, '$1T$2:$3:$4.000Z');
}

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
