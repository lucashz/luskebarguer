import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';

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
const fallbackOutput = path.join(backupsDir, `postgres-${stamp}.sql`);
const statusFile = path.join(backupsDir, 'backup-status.json');

try {
  await writeBackupStatus({ status: 'running', started_at: new Date().toISOString(), output: path.basename(output) });
  const code = await runPgDump(output);
  let finalOutput = output;
  let mode = 'pg_dump';
  if (code !== 0) {
    mode = 'node-sql-fallback';
    finalOutput = fallbackOutput;
    await runSqlFallbackBackup(finalOutput);
  }
  const info = await stat(finalOutput);
  await cleanupOldBackups();
  await writeBackupStatus({
    status: 'success',
    started_at: new Date(stampToDate(stamp)).toISOString(),
    finished_at: new Date().toISOString(),
    output: path.basename(finalOutput),
    size_bytes: info.size,
    retention_days: retentionDays,
    mode
  });
  console.log(`Backup criado em ${finalOutput}`);
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
    const executable = resolveExecutable('pg_dump');
    if (!executable) return resolve(1);
    const child = spawn(executable, [
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
  return first || '';
}

async function runSqlFallbackBackup(outputFile) {
  const client = new pg.Client({
    connectionString,
    ssl: process.env.DB_SSL === 'true' || /sslmode=require/i.test(connectionString) ? { rejectUnauthorized: false } : false
  });
  await client.connect();
  try {
    const tables = await client.query(`
      select schemaname, tablename
      from pg_tables
      where schemaname = 'public'
      order by tablename
    `);
    const chunks = [
      '-- Backup SQL gerado pelo fallback Node.js porque pg_dump nao esta disponivel.',
      `-- Criado em ${new Date().toISOString()}`,
      '-- Recomendado: instalar postgresql-client para backups completos em formato custom.',
      '',
      'begin;',
      'set session_replication_role = replica;',
      ''
    ];
    for (const table of tables.rows) {
      const tableName = table.tablename;
      const columns = await client.query(`
        select column_name, data_type, udt_name
        from information_schema.columns
        where table_schema = 'public' and table_name = $1
        order by ordinal_position
      `, [tableName]);
      const columnMetas = columns.rows;
      const columnNames = columnMetas.map((row) => row.column_name);
      if (!columnNames.length) continue;
      const rows = await client.query(`select * from ${quoteIdentifier(tableName)}`);
      chunks.push(`-- Tabela public.${tableName}`);
      chunks.push(`truncate table ${quoteIdentifier(tableName)} cascade;`);
      for (const row of rows.rows) {
        const values = columnMetas.map((column) => sqlLiteral(row[column.column_name], column)).join(', ');
        chunks.push(`insert into ${quoteIdentifier(tableName)} (${columnNames.map(quoteIdentifier).join(', ')}) values (${values});`);
      }
      chunks.push('');
    }
    chunks.push('set session_replication_role = DEFAULT;');
    chunks.push('commit;');
    chunks.push('');
    await writeFile(outputFile, chunks.join('\n'), 'utf8');
  } finally {
    await client.end().catch(() => {});
  }
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function sqlLiteral(value, column = {}) {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (Buffer.isBuffer(value)) return `decode('${value.toString('hex')}', 'hex')`;
  if (Array.isArray(value)) {
    const elementType = pgArrayElementType(column.udt_name);
    return `ARRAY[${value.map((item) => sqlLiteral(item)).join(', ')}]::${elementType}[]`;
  }
  if (typeof value === 'object') {
    const cast = column.data_type === 'json' ? 'json' : 'jsonb';
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::${cast}`;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function pgArrayElementType(udtName = '') {
  const name = String(udtName || '').replace(/^_/, '') || 'text';
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return name;
  return 'text';
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
    if (!/^postgres-.+\.(dump|sql)$/.test(entry)) continue;
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
