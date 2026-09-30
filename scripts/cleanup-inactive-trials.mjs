import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { trialDeletionCutoff } from '../src/lib/maintenance-policy.js';

loadEnv(new URL('../.env', import.meta.url));

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const days = positiveInt(valueForArg('--days'), 14);
const limit = positiveInt(valueForArg('--limit'), 100);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const cutoff = trialDeletionCutoff(new Date(), days);

try {
  await client.connect();
  const candidates = await findCandidates();
  if (!candidates.length) {
    console.log(`Nenhuma empresa com trial expirado e inativa ha mais de ${days} dia(s).`);
    process.exit(0);
  }

  console.log(`${candidates.length} empresa(s) com trial expirado elegivel(is) para exclusao:`);
  for (const row of candidates) {
    console.log(`- ${row.company_name} (${row.company_id}) | lojas: ${row.store_count} | trial expirou: ${formatDate(row.trial_ends_at)} | ultimo acesso: ${formatDate(row.last_access_at) || 'nunca'}`);
  }

  if (!apply) {
    console.log('\nSimulacao concluida. Rode com --apply para excluir de verdade.');
    process.exit(0);
  }

  await client.query('begin');
  for (const row of candidates) {
    await deleteCompany(row.company_id);
    console.log(`Excluida: ${row.company_name} (${row.company_id})`);
  }
  await client.query('commit');
  console.log(`Limpeza concluida: ${candidates.length} empresa(s) removida(s).`);
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(error.message || error);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

async function findCandidates() {
  const result = await client.query(`
    with trial_companies as (
      select
        c.id,
        c.name,
        c.billing_email,
        c.created_at,
        trial.trial_ends_at,
        greatest(
          trial.trial_ends_at,
          coalesce(max(au.last_login_at), trial.trial_ends_at),
          coalesce(max(sess.created_at), trial.trial_ends_at),
          coalesce(max(sess.updated_at), trial.trial_ends_at)
        ) as last_access_at,
        count(distinct s.id)::int as store_count,
        count(distinct o.id)::int as order_count,
        bool_or(coalesce(sub.status::text, '') in ('active', 'payment_pending', 'grace_period', 'past_due')) as has_paid_or_pending_subscription
      from companies c
      join lateral (
        select cs.trial_ends_at
        from company_subscriptions cs
        where cs.company_id = c.id
          and cs.trial_ends_at is not null
        order by cs.created_at desc
        limit 1
      ) trial on true
      left join stores s on s.company_id = c.id
      left join admin_users au on au.company_id = c.id
      left join app_sessions sess on sess.company_id = c.id
      left join orders o on o.store_id = s.id
      left join company_subscriptions sub on sub.company_id = c.id
      where c.status::text in ('trial', 'cancelled')
        and trial.trial_ends_at < $1
        and coalesce(c.billing_email, '') <> 'admin@cardapio.local'
        and not exists (
          select 1
          from stores demo_store
          where demo_store.company_id = c.id
            and demo_store.slug in ('cardapio', 'demo', 'demonstracao')
        )
      group by c.id, c.name, c.billing_email, c.created_at, trial.trial_ends_at
    )
    select
      id as company_id,
      name as company_name,
      created_at as company_created_at,
      trial_ends_at,
      last_access_at,
      store_count,
      order_count
    from trial_companies
    where last_access_at < $1
      and order_count = 0
      and coalesce(has_paid_or_pending_subscription, false) = false
    order by last_access_at asc
    limit $2
  `, [cutoff.toISOString(), limit]);
  return result.rows;
}

async function deleteCompany(companyId) {
  await client.query('delete from app_sessions where company_id = $1', [companyId]);
  await client.query('delete from admin_user_store_access where company_id = $1', [companyId]);
  await client.query('delete from admin_invitations where company_id = $1', [companyId]).catch(() => {});
  await client.query('delete from admin_users where company_id = $1', [companyId]);
  await client.query('delete from companies where id = $1', [companyId]);
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
  if (!value) return '';
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
