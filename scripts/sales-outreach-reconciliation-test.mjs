import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { reconcileSalesOutreach } from '../src/lib/sales-outreach-reconciliation.js';

loadEnv(new URL('../.env', import.meta.url));
loadEnv(new URL('../../../.env', import.meta.url));
const connectionString = process.env.DATABASE_URL || 'postgresql://cardapio:cardapio_dev_password@localhost:5432/cardapio?schema=public';
const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  await client.query('begin');
  await client.query(`create temporary table sales_leads (
    id uuid primary key, business_name text not null, normalized_phone text unique,
    stage text not null, attempt_count integer not null default 0,
    last_contact_at timestamptz, updated_at timestamptz not null default now()
  ) on commit drop`);
  await client.query(`create temporary table sales_automation_events (
    id uuid primary key default gen_random_uuid(), lead_id uuid, event_type text not null,
    previous_stage text, next_stage text, details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  ) on commit drop`);

  const stages = ['qualified', 'engaged', 'demo_requested', 'opted_out'];
  const manifest = [];
  for (let index = 0; index < 11; index += 1) {
    const phone = `55119990000${String(index).padStart(2, '0')}`;
    const stage = stages[index % stages.length];
    await client.query(
      `insert into sales_leads(id,business_name,normalized_phone,stage)
       values($1,$2,$3,$4)`,
      [randomUUID(), `Lead ${index + 1}`, phone, stage]
    );
    manifest.push({
      businessName: `Lead ${index + 1}`,
      normalizedPhone: phone,
      campaignKey: 'approved-carousel-2026-10-07',
      messageVersion: 'approved-v1',
      partCount: 4,
      contactedAt: '2026-10-07T15:00:00.000Z',
      deliveryStatus: index === 0 ? 'read' : 'delivered'
    });
  }
  const manifestWithMissing = [...manifest, {
    businessName: 'Lead ausente', normalizedPhone: '5511888888888',
    campaignKey: 'approved-carousel-2026-10-07', messageVersion: 'approved-v1',
    partCount: 4, contactedAt: '2026-10-07T15:00:00.000Z', deliveryStatus: 'delivered'
  }];

  const preview = await reconcileSalesOutreach(client, manifestWithMissing, { apply: false });
  assert(preview.matched === 11 && preview.missing === 1, `Prévia incorreta: ${JSON.stringify(preview)}`);
  assert(preview.pending === 11 && preview.inserted === 0, `Prévia escreveu ou não encontrou pendências: ${JSON.stringify(preview)}`);
  assert(Number((await client.query(`select count(*) from sales_automation_events`)).rows[0].count) === 0, 'Prévia criou eventos.');

  const firstApply = await reconcileSalesOutreach(client, manifestWithMissing, { apply: true });
  assert(firstApply.inserted === 11 && firstApply.updated === 11, `Primeira aplicação incorreta: ${JSON.stringify(firstApply)}`);
  const afterFirstApply = await client.query(`select business_name,stage,attempt_count,last_contact_at from sales_leads order by business_name`);
  assert(afterFirstApply.rows.every((lead) => lead.attempt_count === 1 && lead.last_contact_at), 'Primeira aplicação não anotou tentativa e data.');
  assert(afterFirstApply.rows.find((lead) => lead.business_name === 'Lead 1').stage === 'awaiting_reply', 'Lead qualificado não avançou para awaiting_reply.');
  assert(afterFirstApply.rows.find((lead) => lead.business_name === 'Lead 2').stage === 'engaged', 'Lead engajado regrediu de estágio.');
  assert(afterFirstApply.rows.find((lead) => lead.business_name === 'Lead 3').stage === 'demo_requested', 'Lead de demonstração regrediu de estágio.');
  assert(afterFirstApply.rows.find((lead) => lead.business_name === 'Lead 4').stage === 'opted_out', 'Opt-out regrediu de estágio.');

  const secondApply = await reconcileSalesOutreach(client, manifestWithMissing, { apply: true });
  assert(secondApply.inserted === 0 && secondApply.updated === 0 && secondApply.unchanged === 11, `Segunda aplicação não foi idempotente: ${JSON.stringify(secondApply)}`);
  assert(Number((await client.query(`select max(attempt_count) maximum from sales_leads`)).rows[0].maximum) === 1, 'Segunda aplicação incrementou tentativas.');

  const concurrentLeadId = randomUUID();
  const concurrentPhone = '5511999887766';
  await client.query(
    `insert into sales_leads(id,business_name,normalized_phone,stage)
     values($1,'Lead concorrente',$2,'qualified')`,
    [concurrentLeadId, concurrentPhone]
  );
  let injected = false;
  const interleavingClient = {
    async query(sql, values) {
      if (!injected && String(sql).includes('pg_advisory_xact_lock')) {
        injected = true;
        await client.query(`update sales_leads set stage='opted_out' where id=$1`, [concurrentLeadId]);
      }
      return client.query(sql, values);
    }
  };
  await reconcileSalesOutreach(interleavingClient, [{
    businessName: 'Lead concorrente', normalizedPhone: concurrentPhone,
    campaignKey: 'concurrent-campaign', messageVersion: 'approved-v1',
    partCount: 4, contactedAt: '2026-10-07T15:00:00.000Z', deliveryStatus: 'delivered'
  }], { apply: true });
  const concurrentStage = (await client.query(`select stage from sales_leads where id=$1`, [concurrentLeadId])).rows[0].stage;
  assert(concurrentStage === 'opted_out', `Reconciliação sobrescreveu estágio concorrente com ${concurrentStage}.`);

  console.log('Sales outreach reconciliation test: OK');
} finally {
  await client.query('rollback').catch(() => {});
  client.release();
  await pool.end();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadEnv(url) {
  if (!existsSync(url)) return;
  for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith('#') || !value.includes('=')) continue;
    const index = value.indexOf('=');
    const key = value.slice(0, index).trim();
    process.env[key] ||= value.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}
