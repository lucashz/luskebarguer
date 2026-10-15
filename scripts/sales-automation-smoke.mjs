import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { assertSalesTransition, autonomousSalesMessageAllowed, canAutomaticallySend, configuredSalesFacts, fallbackSalesDecision, initialSalesMessage, isOptOutMessage, normalizeSalesPhone, parseEvolutionInbound, requestSalesDecision, salesConfig, salesIdempotencyKey, salesInboundEventKey, shouldAutomaticallyReplyToLead, shouldPauseForEvolutionConnectionState } from '../src/lib/sales-automation.js';

loadEnv(new URL('../.env', import.meta.url));

assert(normalizeSalesPhone('(55) 99999-0000') === '5555999990000', 'Normalização de telefone falhou.');
assert(normalizeSalesPhone('(55) 9999-0000') === '555599990000', 'Normalização de telefone fixo falhou.');
assert(isOptOutMessage('Não me mande mais mensagens'), 'Opt-out não foi reconhecido.');
assert(fallbackSalesDecision('Quanto custa?').requires_human, 'Pergunta de preço não gerou handoff.');
assert(fallbackSalesDecision('Já usamos o iFood').intent === 'existing_competitor', 'Concorrente não foi identificado.');
assert(initialSalesMessage({ business_name: 'Le Mangiare', city: 'Três de Maio' }).includes('Le Mangiare'), 'Primeira mensagem não foi personalizada.');
assertSalesTransition('qualified', 'awaiting_first_message_approval');
assertThrows(() => assertSalesTransition('opted_out', 'engaged'), 'Transição terminal inválida foi aceita.');

const parsed = parseEvolutionInbound({ event: 'MESSAGE', data: { key: { id: 'msg-1', remoteJid: '5555999990000@s.whatsapp.net', fromMe: false }, message: { conversation: 'Olá' }, messageType: 'text' } });
assert(parsed?.phone === '5555999990000' && parsed.body === 'Olá', 'Webhook de texto não foi normalizado.');
assert(!parseEvolutionInbound({ event: 'MESSAGE', data: { key: { id: 'msg-2', remoteJid: '5555999990000@s.whatsapp.net', fromMe: true }, message: { conversation: 'eco' } } }), 'Mensagem própria não foi ignorada.');
assert(!parseEvolutionInbound({ event: 'MESSAGE', data: { key: { id: 'msg-3', remoteJid: '123@g.us', fromMe: false }, message: { conversation: 'grupo' } } }), 'Grupo não foi ignorado.');
assert(!shouldPauseForEvolutionConnectionState('connecting'), 'Estado transitório connecting pausou a automação.');
assert(!shouldPauseForEvolutionConnectionState('open'), 'Estado open pausou a automação.');
assert(shouldPauseForEvolutionConnectionState('close'), 'Desconexão confirmada não pausou a automação.');
const noIdPayload = { event: 'MESSAGES_UPSERT', instance: 'sales', data: { key: { remoteJid: '5555999990000@s.whatsapp.net', fromMe: false }, message: { conversation: 'Sem ID' }, messageTimestamp: 123 } };
const noIdInbound = parseEvolutionInbound(noIdPayload);
assert(salesInboundEventKey(noIdPayload, noIdInbound) === salesInboundEventKey(noIdPayload, noIdInbound), 'Fallback idempotente do webhook é instável.');

const draftGate = canAutomaticallySend({ config: salesConfig({ SALES_AUTOMATION_ENABLED: 'true', SALES_AUTOMATION_MODE: 'draft', SALES_WHATSAPP_STORE_ID: randomUUID(), SALES_ALLOWED_START_TIME: '00:00', SALES_ALLOWED_END_TIME: '23:59' }), lead: { stage: 'qualified', automation_status: 'active' }, message: { status: 'approved' } });
assert(!draftGate.allowed, 'Modo draft permitiu envio.');
const suppressedGate = canAutomaticallySend({ config: salesConfig({ SALES_AUTOMATION_ENABLED: 'true', SALES_AUTOMATION_MODE: 'supervised', SALES_WHATSAPP_STORE_ID: randomUUID(), SALES_ALLOWED_START_TIME: '00:00', SALES_ALLOWED_END_TIME: '23:59' }), lead: { stage: 'qualified', automation_status: 'active' }, message: { status: 'approved' }, suppressed: true });
assert(!suppressedGate.allowed, 'Contato suprimido foi liberado.');
assert(salesIdempotencyKey('message', '1') === salesIdempotencyKey('message', '1'), 'Chave idempotente é instável.');

assert(!shouldAutomaticallyReplyToLead({ source: 'google_outreach' }), 'Lead da prospecção personalizada recebeu resposta automática.');
assert(shouldAutomaticallyReplyToLead({ source: 'manual' }), 'Fluxo comercial legado perdeu a resposta automática.');

const v2Config = salesConfig({ SALES_AUTOMATION_ENABLED: 'true', SALES_AUTOMATION_MODE: 'autonomous', SALES_EVOLUTION_V2_BASE_URL: 'http://evolution:8080', SALES_EVOLUTION_V2_API_KEY: 'secret', SALES_EVOLUTION_V2_INSTANCE: 'sales', SALES_ALLOWED_START_TIME: '00:00', SALES_ALLOWED_END_TIME: '23:59' });
assert(v2Config.provider === 'evolution_v2' && v2Config.dailyLimit === 10, 'Configuração segura da Evolution v2 falhou.');
const v2Gate = canAutomaticallySend({ config: v2Config, lead: { stage: 'qualified', automation_status: 'active' }, message: { status: 'approved' } });
assert(v2Gate.allowed, 'Evolution v2 exigiu loja interna indevidamente.');
const facts = configuredSalesFacts({ SALES_MONTHLY_PRICE: '49,90', SALES_DEMO_URL_DEFAULT: 'https://demo.example', SALES_CHECKOUT_URL: 'https://pay.example' });
assert(facts.monthlyPrice === '49,90' && facts.demoUrl === 'https://demo.example', 'Fatos comerciais não foram carregados.');
const unknown = fallbackSalesDecision('Integra com a balança Toledo?');
assert(unknown.requires_human && unknown.reply?.toLowerCase().includes('não quero te passar uma informação errada'), 'Pergunta desconhecida não gerou contenção e handoff.');
assert(!autonomousSalesMessageAllowed(unknown, v2Config), 'Resposta desconhecida foi liberada automaticamente.');
const priced = fallbackSalesDecision('Quanto custa?', { facts });
assert(priced.reply?.includes('49,90') && !priced.requires_human, 'Preço configurado não foi respondido.');

const scripted = await requestSalesDecision({ messages: [{ direction: 'inbound', body: 'Tenho interesse' }] });
assert(scripted.intent === 'interested' && scripted.reply, 'Roteiro local não respondeu ao interesse.');
assert((await requestSalesDecision({ messages: [{ direction: 'inbound', body: 'Quanto custa?' }] })).requires_human, 'Preço não foi encaminhado para atendimento humano.');
assert((await requestSalesDecision({ messages: [{ direction: 'inbound', body: 'Não tenho interesse' }] })).should_stop_automation, 'Recusa não interrompeu a automação.');

if (process.env.DATABASE_URL) await databaseSmoke();
console.log('Sales automation smoke: OK');

async function databaseSmoke() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    const schema = await client.query(`select to_regclass('public.sales_leads') leads,to_regclass('public.sales_messages') messages,to_regclass('public.sales_automation_jobs') jobs,to_regclass('public.sales_suppressions') suppressions`);
    assert(schema.rows[0].leads && schema.rows[0].messages && schema.rows[0].jobs && schema.rows[0].suppressions, 'Schema de prospecção não foi aplicado.');
    await client.query('begin');
    const id = randomUUID(); const phone = `55${String(Date.now()).slice(-11)}`;
    await client.query(`insert into sales_leads(id,business_name,phone,normalized_phone,score,stage) values($1,'Smoke Sales',$2,$2,90,'qualified')`, [id, phone]);
    const conversation = (await client.query(`insert into sales_conversations(lead_id) values($1) returning id`, [id])).rows[0];
    const message = (await client.query(`insert into sales_messages(lead_id,conversation_id,direction,body,status) values($1,$2,'inbound','Olá','received') returning id`, [id, conversation.id])).rows[0];
    const key = salesIdempotencyKey('classify_inbound', message.id);
    await client.query(`insert into sales_automation_jobs(lead_id,message_id,job_type,idempotency_key) values($1,$2,'classify_inbound',$3)`, [id, message.id, key]);
    await assertRejects(() => client.query(`insert into sales_automation_jobs(lead_id,message_id,job_type,idempotency_key) values($1,$2,'classify_inbound',$3)`, [id, message.id, key]), 'Job duplicado foi aceito.');
    await client.query('rollback');
  } finally { client.release(); await pool.end(); }
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function assertThrows(fn, message) { try { fn(); } catch { return; } throw new Error(message); }
async function assertRejects(fn, message) { try { await fn(); } catch { return; } throw new Error(message); }
function loadEnv(url) { if (!existsSync(url)) return; for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) { const value = line.trim(); if (!value || value.startsWith('#') || !value.includes('=')) continue; const index = value.indexOf('='); const key = value.slice(0, index).trim(); process.env[key] ||= value.slice(index + 1).trim().replace(/^['"]|['"]$/g, ''); } }
