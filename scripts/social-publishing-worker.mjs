import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { claimNextPublication, processClaimedPublication, socialConfig, syncPublicationMetrics } from '../src/lib/social-publishing.js';
import { generateDailyAutopilotPost } from '../src/lib/marketing-autopilot.js';

loadEnv(new URL('../.env', import.meta.url));
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
const config = socialConfig();
const once = process.argv.includes('--once');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
let stopping = false;

process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

try {
  do {
    await runCycle();
    if (!once && !stopping) await wait(config.workerIntervalSeconds * 1000);
  } while (!once && !stopping);
} finally { await pool.end(); }

async function runCycle() {
  const started = new Date();
  let processed = 0;
  let failed = 0;
  await pool.query(`insert into social_worker_state(worker_key,status,last_started_at,next_run_at,updated_at) values('instagram-publisher','running',now(),now()+($1||' seconds')::interval,now()) on conflict(worker_key) do update set status='running',last_started_at=now(),next_run_at=excluded.next_run_at,updated_at=now()`, [String(config.workerIntervalSeconds)]);
  try {
    while (processed < 10 && !stopping) {
      const client = await pool.connect();
      try {
        const publication = await claimNextPublication(client);
        if (!publication) break;
        await processClaimedPublication(client, publication);
        processed += 1;
      } catch (error) { failed += 1; console.error(JSON.stringify({ scope: 'social-publishing-worker', message: error.message })); }
      finally { client.release(); }
    }
    const metricsClient = await pool.connect();
    try { await syncPublicationMetrics(metricsClient); } finally { metricsClient.release(); }
    await generateDailyAutopilotPost().catch((error) => console.error(JSON.stringify({ scope: 'marketing-autopilot', message: error.message })));
    await createOperationalAlerts();
    await pool.query(`update social_worker_state set status='idle',last_finished_at=now(),processed_count=processed_count+$1,failed_count=failed_count+$2,last_error='',updated_at=now() where worker_key='instagram-publisher'`, [processed, failed]);
  } catch (error) {
    await pool.query(`update social_worker_state set status='error',last_finished_at=now(),failed_count=failed_count+1,last_error=$1,updated_at=now() where worker_key='instagram-publisher'`, [String(error.message || '').slice(0, 1000)]).catch(() => {});
    if (once) throw error;
  }
  if (once) console.log(`Social worker: OK (${processed} processada(s), ${failed} falha(s), ${Date.now() - started.getTime()}ms)`);
}

async function createOperationalAlerts() {
  const due = await pool.query(`select count(*)::int total from marketing_content_items where channel='instagram' and status in ('approved','scheduled') and scheduled_at::date=current_date`);
  if (!due.rows[0].total) await upsertAlert('instagram:empty-daily-queue', 'attention', 'empty_queue', 'Não há conteúdo aprovado na fila de hoje.');
  const failed = await pool.query(`select id,account_id,last_error from social_publications where status='failed' and updated_at>now()-interval '24 hours' limit 20`);
  for (const item of failed.rows) await upsertAlert(`instagram:publication:${item.id}`, 'critical', 'publication_failed', item.last_error || 'Publicação falhou.', item.account_id, item.id);
  const tokenDays = config.tokenAlertDays;
  const expiring = await pool.query(`select id,username,token_expires_at from social_accounts where mode='live' and status='connected' and token_expires_at<now()+($1||' days')::interval`, [String(tokenDays)]);
  for (const account of expiring.rows) await upsertAlert(`instagram:token:${account.id}`, 'attention', 'token_expiring', `Token de @${account.username || 'instagram'} próximo de expirar.`, account.id);
}

async function upsertAlert(key, severity, kind, message, accountId = null, publicationId = null) {
  await pool.query(`insert into social_alerts(dedupe_key,severity,kind,message,account_id,publication_id) values($1,$2,$3,$4,$5,$6) on conflict(dedupe_key) where status='open' do update set severity=excluded.severity,message=excluded.message,updated_at=now()`, [key, severity, kind, message, accountId, publicationId]);
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function loadEnv(url) {
  if (!existsSync(url)) return;
  for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim(); if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('='); process.env[key.trim()] ||= rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
}
