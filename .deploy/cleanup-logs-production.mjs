import { existsSync, readFileSync } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));

const apply = process.argv.includes('--apply');
const jsonOutput = process.argv.includes('--json');
const startedAt = Date.now();
const connectionString = process.env.DATABASE_URL || '';

if (!connectionString) {
  fail('DATABASE_URL ausente.');
}

const retention = {
  audit: envDays('AUDIT_LOG_RETENTION_DAYS', envDays('LOG_RETENTION_DAYS', 180)),
  operational: envDays('OPERATIONAL_LOG_RETENTION_DAYS', 90),
  sessions: envDays('SESSION_RETENTION_DAYS', 7),
  subscriptionEvents: envDays('SUBSCRIPTION_EVENT_RETENTION_DAYS', 365),
  billingEvents: envDays('BILLING_EVENT_RETENTION_DAYS', 1825),
  supportMessages: envDays('SUPPORT_MESSAGE_RETENTION_DAYS', 730),
  backups: envDays('BACKUP_RETENTION_DAYS', 7),
  tmp: envDays('TMP_RETENTION_DAYS', 7)
};

const backupDir = path.resolve(process.env.BACKUP_DIR || 'backups');
const tmpDir = path.resolve(process.env.TMP_DIR || '.tmp');

const client = new pg.Client({
  connectionString,
  ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false
});

try {
  await client.connect();
  const result = {
    ok: true,
    mode: apply ? 'apply' : 'dry_run',
    started_at: new Date(startedAt).toISOString(),
    finished_at: null,
    duration_ms: 0,
    retention_days: retention,
    database: [],
    files: [],
    totals: {
      database_rows: 0,
      files: 0,
      bytes: 0,
      rows_removed: 0,
      files_removed: 0,
      bytes_removed: 0
    }
  };

  await cleanupDatabase(result);
  await cleanupDirectory(result, {
    key: 'backups',
    directory: backupDir,
    retentionDays: retention.backups,
    pattern: /^postgres-.+\.dump$/
  });
  await cleanupDirectory(result, {
    key: 'tmp',
    directory: tmpDir,
    retentionDays: retention.tmp
  });

  result.finished_at = new Date().toISOString();
  result.duration_ms = Date.now() - startedAt;
  await recordCleanupAudit(result).catch(() => {});
  output(result);
} catch (error) {
  const result = {
    ok: false,
    mode: apply ? 'apply' : 'dry_run',
    error: error.message || String(error),
    duration_ms: Date.now() - startedAt
  };
  await recordCleanupAudit(result).catch(() => {});
  output(result);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

async function cleanupDatabase(result) {
  const operationalCutoff = cutoff(retention.operational);
  const auditCutoff = cutoff(retention.audit);
  const subscriptionCutoff = cutoff(retention.subscriptionEvents);
  const billingCutoff = cutoff(retention.billingEvents);
  const supportCutoff = cutoff(retention.supportMessages);

  await cleanupQuery(result, {
    table: 'app_sessions',
    label: 'Sessões expiradas',
    where: 'expires_at < now()'
  });

  await cleanupQuery(result, {
    table: 'audit_logs',
    label: 'Auditoria operacional antiga',
    where: `created_at < $1 and (
      action = 'platform.access'
      or action like 'platform.service.%'
      or action like 'platform.smtp.test%'
      or action like 'platform.service.confirmation.%'
      or action like 'platform.service.password.%'
    )`,
    params: [operationalCutoff]
  });

  await cleanupQuery(result, {
    table: 'audit_logs',
    label: 'Auditoria antiga',
    where: 'created_at < $1',
    params: [auditCutoff]
  });

  await cleanupQuery(result, {
    table: 'subscription_events',
    label: 'Eventos de assinatura antigos',
    where: 'created_at < $1',
    params: [subscriptionCutoff]
  });

  if (await tableExists('billing_events')) {
    await cleanupQuery(result, {
      table: 'billing_events',
      label: 'Eventos financeiros antigos',
      where: 'created_at < $1',
      params: [billingCutoff]
    });
  }

  if (await tableExists('support_ticket_messages') && retention.supportMessages > 0) {
    await cleanupQuery(result, {
      table: 'support_ticket_messages',
      label: 'Mensagens antigas de chamados fechados',
      where: `created_at < $1 and exists (
        select 1 from support_tickets t
        where t.id = support_ticket_messages.ticket_id
          and t.status in ('resolved', 'closed')
      )`,
      params: [supportCutoff]
    });
  }
}

async function cleanupQuery(result, item) {
  if (!(await tableExists(item.table))) return;
  const params = item.params || [];
  const countSql = `select count(*)::int as count from ${quoteIdent(item.table)} where ${item.where}`;
  const count = Number((await client.query(countSql, params)).rows[0]?.count || 0);
  let removed = 0;
  if (apply && count) {
    const deleteSql = `delete from ${quoteIdent(item.table)} where ${item.where}`;
    removed = Number((await client.query(deleteSql, params)).rowCount || 0);
  }
  result.database.push({
    table: item.table,
    label: item.label,
    matched_rows: count,
    removed_rows: apply ? removed : 0
  });
  result.totals.database_rows += count;
  result.totals.rows_removed += apply ? removed : 0;
}

async function cleanupDirectory(result, options) {
  const directory = options.directory;
  const retentionDays = Math.max(1, Number(options.retentionDays || 1));
  const cutoffMs = Date.now() - retentionDays * 86400000;
  const summary = {
    key: options.key,
    directory,
    retention_days: retentionDays,
    matched_files: 0,
    removed_files: 0,
    matched_bytes: 0,
    removed_bytes: 0
  };
  if (!existsSync(directory)) {
    result.files.push(summary);
    return;
  }
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    const info = await stat(fullPath).catch(() => null);
    if (!info || info.mtimeMs >= cutoffMs) continue;
    if (options.pattern && !options.pattern.test(entry.name)) continue;
    summary.matched_files += 1;
    summary.matched_bytes += info.size || 0;
    if (apply) {
      await rm(fullPath, { recursive: true, force: true }).catch(() => {});
      summary.removed_files += 1;
      summary.removed_bytes += info.size || 0;
    }
  }
  result.files.push(summary);
  result.totals.files += summary.matched_files;
  result.totals.bytes += summary.matched_bytes;
  result.totals.files_removed += summary.removed_files;
  result.totals.bytes_removed += summary.removed_bytes;
}

async function recordCleanupAudit(result) {
  await client.query(`
    insert into audit_logs (action, entity_type, severity, after_data, created_at)
    values ('platform.logs.cleanup', 'platform_service', $1, $2::jsonb, now())
  `, [result.ok ? 'info' : 'critical', JSON.stringify({
    mode: result.mode,
    ok: result.ok,
    error: result.error || null,
    duration_ms: result.duration_ms,
    retention_days: result.retention_days || retention,
    totals: result.totals || null,
    actor_admin_id: process.env.CLEANUP_ACTOR_ADMIN_ID || null,
    request_source: process.env.CLEANUP_REQUEST_SOURCE || 'script'
  })]);
}

async function tableExists(table) {
  const result = await client.query('select to_regclass($1) as exists', [`public.${table}`]);
  return Boolean(result.rows[0]?.exists);
}

function cutoff(days) {
  return new Date(Date.now() - Math.max(1, Number(days || 1)) * 86400000);
}

function envDays(key, fallback) {
  const value = Number.parseInt(process.env[key] || '', 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function output(result) {
  if (jsonOutput) {
    console.log(JSON.stringify(result));
    return;
  }
  console.log(`${result.mode === 'apply' ? 'Limpeza aplicada' : 'Simulação de limpeza'} concluída.`);
  if (result.error) console.log(`Erro: ${result.error}`);
  for (const item of result.database || []) {
    console.log(`- ${item.label}: ${item.matched_rows} registro(s) elegível(is), ${item.removed_rows} removido(s).`);
  }
  for (const item of result.files || []) {
    console.log(`- ${item.key}: ${item.matched_files} arquivo(s), ${formatBytes(item.matched_bytes)} elegível(is); ${item.removed_files} removido(s).`);
  }
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

function shouldUseSsl(value) {
  return process.env.DB_SSL === 'true' || /sslmode=require/i.test(String(value || ''));
}

function fail(message) {
  output({ ok: false, mode: apply ? 'apply' : 'dry_run', error: message });
  process.exit(1);
}
