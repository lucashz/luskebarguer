import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const graceDays = positiveInt(valueForArg('--grace-days') || process.env.BILLING_GRACE_DAYS, 7);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const now = new Date();

try {
  await client.connect();
  const activeExpired = await findActiveExpired();
  const paymentPendingExpired = await findPaymentPendingExpired();
  const graceExpired = await findGraceExpired();

  console.log(`Assinaturas ativas vencidas: ${activeExpired.length}`);
  console.log(`Cobranças pendentes vencidas: ${paymentPendingExpired.length}`);
  console.log(`Assinaturas fora da tolerância: ${graceExpired.length}`);

  for (const row of [...activeExpired, ...paymentPendingExpired, ...graceExpired]) {
    console.log(`- ${row.company_name || row.company_id} | assinatura ${row.id} | status atual: ${row.status}`);
  }

  if (!apply) {
    console.log('\nSimulação concluída. Rode com --apply para aplicar as mudanças.');
    process.exit(0);
  }

  await client.query('begin');
  for (const row of activeExpired) await moveToGracePeriod(row);
  for (const row of paymentPendingExpired) await moveToPastDue(row);
  for (const row of graceExpired) await moveToBlocked(row);
  await client.query('commit');
  console.log('Sincronização de billing concluída.');
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(error.message || error);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

async function findActiveExpired() {
  const result = await client.query(`
    select s.*, c.name as company_name
    from company_subscriptions s
    join companies c on c.id = s.company_id
    where s.status = 'active'
      and s.current_period_ends_at is not null
      and s.current_period_ends_at < $1
    order by s.current_period_ends_at asc
  `, [now.toISOString()]);
  return result.rows;
}

async function findPaymentPendingExpired() {
  const result = await client.query(`
    select s.*, c.name as company_name
    from company_subscriptions s
    join companies c on c.id = s.company_id
    where s.status = 'payment_pending'
      and coalesce(s.payment_due_at, s.created_at + interval '3 days') < $1
    order by coalesce(s.payment_due_at, s.created_at) asc
  `, [now.toISOString()]);
  return result.rows;
}

async function findGraceExpired() {
  const result = await client.query(`
    select s.*, c.name as company_name
    from company_subscriptions s
    join companies c on c.id = s.company_id
    where s.status in ('grace_period', 'past_due')
      and coalesce(s.payment_due_at, s.current_period_ends_at + ($2::int * interval '1 day'), s.updated_at) < $1
    order by coalesce(s.payment_due_at, s.current_period_ends_at, s.updated_at) asc
  `, [now.toISOString(), graceDays]);
  return result.rows;
}

async function moveToGracePeriod(row) {
  const graceEndsAt = new Date(new Date(row.current_period_ends_at).getTime() + graceDays * 86400000);
  await client.query(`
    update company_subscriptions
    set status = 'grace_period',
        payment_due_at = coalesce(payment_due_at, $2),
        updated_at = now()
    where id = $1
  `, [row.id, graceEndsAt.toISOString()]);
  await client.query(`update companies set status = 'grace_period', updated_at = now() where id = $1`, [row.company_id]);
  await insertEvent(row, 'billing.grace_period', `Assinatura entrou em tolerância até ${formatDate(graceEndsAt)}.`);
}

async function moveToPastDue(row) {
  const graceEndsAt = new Date(now.getTime() + graceDays * 86400000);
  await client.query(`
    update company_subscriptions
    set status = 'past_due',
        payment_due_at = coalesce(payment_due_at, $2),
        updated_at = now()
    where id = $1
  `, [row.id, graceEndsAt.toISOString()]);
  await client.query(`update companies set status = 'past_due', updated_at = now() where id = $1`, [row.company_id]);
  await insertEvent(row, 'billing.past_due', `Cobrança pendente vencida. Tolerância até ${formatDate(graceEndsAt)}.`);
}

async function moveToBlocked(row) {
  await client.query(`
    update company_subscriptions
    set status = 'blocked',
        suspended_at = coalesce(suspended_at, now()),
        updated_at = now()
    where id = $1
  `, [row.id]);
  await client.query(`update companies set status = 'blocked', updated_at = now() where id = $1`, [row.company_id]);
  await insertEvent(row, 'billing.blocked', 'Assinatura bloqueada por falta de pagamento.');
}

async function insertEvent(row, type, description) {
  await client.query(`
    insert into subscription_events (company_id, subscription_id, event_type, description, metadata)
    values ($1, $2, $3, $4, $5::jsonb)
  `, [
    row.company_id,
    row.id,
    type,
    description,
    JSON.stringify({ source: 'billing_sync', grace_days: graceDays, synced_at: now.toISOString() })
  ]);
}

function valueForArg(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : '';
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
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
