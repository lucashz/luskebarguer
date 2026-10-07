import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { buildSalesMetricsQuery } from '../src/lib/sales-metrics.js';

loadEnv(new URL('../.env', import.meta.url));
loadEnv(new URL('../../../.env', import.meta.url));
const connectionString = process.env.DATABASE_URL || 'postgresql://cardapio:cardapio_dev_password@localhost:5432/cardapio?schema=public';
const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  await client.query('begin');
  await client.query(`create temporary table sales_leads (
    id uuid primary key, business_name text not null, normalized_phone text,
    stage text not null, metadata jsonb not null default '{}'::jsonb
  ) on commit drop`);
  await client.query(`create temporary table sales_automation_events (
    id uuid primary key default gen_random_uuid(), lead_id uuid, event_type text not null,
    details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
  ) on commit drop`);
  await client.query(`create temporary table sales_messages (
    id uuid primary key default gen_random_uuid(), lead_id uuid, direction text not null,
    body text not null, intent text, status text not null, sent_at timestamptz,
    received_at timestamptz, metadata jsonb not null default '{}'::jsonb
  ) on commit drop`);
  const contactedLeadId = randomUUID();
  const uncontactedLeadId = randomUUID();
  const suffix = Date.now();

  await client.query(
    `insert into sales_leads(id,business_name,normalized_phone,stage)
     values ($1,'Lead contatado',$2,'engaged'),($3,'Lead sem disparo',$4,'engaged')`,
    [contactedLeadId, `5599${suffix}`, uncontactedLeadId, `5588${suffix}`]
  );
  await client.query(
    `insert into sales_automation_events(lead_id,event_type,details)
     values($1,'outreach_sent',$2::jsonb)`,
    [contactedLeadId, JSON.stringify({ campaign_key: `test-${suffix}`, delivery_status: 'read' })]
  );
  for (let index = 0; index < 4; index += 1) {
    await client.query(
      `insert into sales_messages(lead_id,direction,body,status,sent_at,metadata)
       values($1,'outbound',$2,'sent',now(),$3::jsonb)`,
      [contactedLeadId, `Parte ${index + 1}`, JSON.stringify({ delivery_status: 'read' })]
    );
  }
  for (let index = 0; index < 3; index += 1) {
    await client.query(
      `insert into sales_messages(lead_id,direction,body,status,received_at)
       values($1,'inbound',$2,'received',now())`,
      [contactedLeadId, `Resposta ${index + 1}`]
    );
  }
  await client.query(
    `insert into sales_messages(lead_id,direction,body,status,received_at)
     values($1,'inbound','Resposta sem disparo','received',now())`,
    [uncontactedLeadId]
  );

  const result = await client.query(buildSalesMetricsQuery());
  const metrics = result.rows[0];

  assert(metrics.outreaches === 1, `Esperava 1 disparo, recebeu ${metrics.outreaches}.`);
  assert(metrics.outbound_message_parts === 4, `Esperava 4 partes, recebeu ${metrics.outbound_message_parts}.`);
  assert(metrics.responding_contacts === 1, `Esperava 1 contato respondente, recebeu ${metrics.responding_contacts}.`);
  assert(metrics.inbound_messages === 3, `Esperava 3 respostas do contato abordado, recebeu ${metrics.inbound_messages}.`);
  assert(metrics.delivered_contacts === 1, `Esperava 1 contato entregue, recebeu ${metrics.delivered_contacts}.`);
  assert(metrics.read_contacts === 1, `Esperava 1 contato que leu, recebeu ${metrics.read_contacts}.`);
  assert(Number(metrics.reply_rate) === 100, `Esperava taxa de resposta 100, recebeu ${metrics.reply_rate}.`);
  assert(Number(metrics.delivery_rate) === 100, `Esperava taxa de entrega 100, recebeu ${metrics.delivery_rate}.`);
  assert(Number(metrics.read_rate) === 100, `Esperava taxa de leitura 100, recebeu ${metrics.read_rate}.`);

  console.log('Sales metrics test: OK');
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
