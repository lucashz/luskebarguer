import { existsSync, readFileSync } from 'node:fs';
import { createSalesLead, createSalesDraft, approveSalesMessage, sendApprovedSalesMessage, dbRequest, getStoreWhatsappIntegration, optOutSalesLead, processNextSalesJob, queueAutonomousSalesOutreach, receiveSalesEvolutionMessage, scheduleDueSalesFollowups } from '../server.js';
import { evolutionV2SalesConfig, getEvolutionV2ConnectionState, setEvolutionV2SalesWebhook } from '../src/lib/evolution-v2-sales.js';
import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { normalizeSalesPhone, salesConfig } from '../src/lib/sales-automation.js';

const [command = 'help', ...positionals] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const flags = parseFlags(process.argv.slice(2));

try {
  const result = await run(command, positionals, flags);
  if (result !== undefined) console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message, status: error.status || 500 }));
  process.exitCode = 1;
} finally {
  await getLocalPool().end().catch(() => {});
}

async function run(command, args, options) {
  if (command === 'help') return { commands: COMMANDS };
  if (command === 'status') {
    const config = salesConfig();
    if (config.provider === 'evolution_v2') {
      const provider = evolutionV2SalesConfig();
      const [settings] = await dbRequest('GET', 'sales_automation_settings', { id: 'eq.global', limit: '1' });
      const state = await getEvolutionV2ConnectionState(provider).catch((error) => ({ connected: false, state: 'error', error: error.message }));
      return { enabled: config.enabled, mode: config.mode, provider: 'evolution_v2', instance: provider.instance, paused: Boolean(settings?.paused), connected: state.connected, state: state.state };
    }
    const integration = config.storeId ? await getStoreWhatsappIntegration(config.storeId) : null;
    const [settings] = await dbRequest('GET', 'sales_automation_settings', { id: 'eq.global', limit: '1' });
    return { enabled: config.enabled, mode: config.mode, store_id: config.storeId || null, paused: Boolean(settings?.paused), integration: integration ? { id: integration.id, store_id: integration.store_id, instance_name: integration.instance_name, status: integration.status, provider: integration.provider } : null };
  }
  if (command === 'lead:create') return createSalesLead(leadFromFlags(options));
  if (command === 'outreach:queue') return queueAutonomousSalesOutreach({ limit: Number(options.limit || 10), dryRun: Boolean(options['dry-run']) });
  if (command === 'provider:test') return getEvolutionV2ConnectionState(evolutionV2SalesConfig());
  if (command === 'webhook:configure') return setEvolutionV2SalesWebhook({ url: options.url || process.env.SALES_EVOLUTION_V2_WEBHOOK_URL, secret: process.env.SALES_EVOLUTION_V2_WEBHOOK_SECRET }, evolutionV2SalesConfig());
  if (command === 'lead:import') return importLeads(args[0] || options.file, Boolean(options['dry-run']));
  if (command === 'lead:list') return dbRequest('GET', 'sales_leads', { select: '*', order: 'score.desc,created_at.desc', limit: options.limit || '100' });
  if (command === 'lead:show') return showLead(required(args[0], 'Informe o ID do lead.'));
  if (command === 'lead:pause') return patchLead(required(args[0], 'Informe o ID do lead.'), { stage: 'paused', automation_status: 'paused', next_followup_at: null });
  if (command === 'lead:resume') return resumeLead(required(args[0], 'Informe o ID do lead.'));
  if (command === 'lead:opt-out') return optOutSalesLead(required(args[0], 'Informe o ID do lead.'), options.reason || 'Opt-out registrado pelo operador.');
  if (command === 'message:draft') return createSalesDraft(required(args[0], 'Informe o ID do lead.'), { body: options.body || '', kind: options.kind || 'first_contact' });
  if (command === 'message:approve') return approveSalesMessage(required(args[0], 'Informe o ID da mensagem.'));
  if (command === 'message:send') {
    if (options['dry-run']) return { dry_run: true, message_id: required(args[0], 'Informe o ID da mensagem.'), sent: false };
    return sendApprovedSalesMessage(required(args[0], 'Informe o ID da mensagem.'));
  }
  if (command === 'history') return dbRequest('GET', 'sales_messages', { lead_id: `eq.${required(args[0], 'Informe o ID do lead.')}`, order: 'created_at.asc', limit: '200' });
  if (command === 'inbox:process') return processJobs(Number(options.limit || 20));
  if (command === 'followups:run') return options['dry-run'] ? dueFollowups() : scheduleDueSalesFollowups();
  if (command === 'handoff:list') return dbRequest('GET', 'sales_leads', { stage: 'eq.human_handoff', order: 'updated_at.asc', limit: options.limit || '100' });
  if (command === 'automation:pause' || command === 'automation:resume') {
    const paused = command.endsWith('pause');
    const [row] = await dbRequest('PATCH', 'sales_automation_settings', { id: 'eq.global' }, { paused, updated_at: new Date().toISOString() }, ['Prefer: return=representation']);
    return row;
  }
  if (command === 'metrics') return metrics();
  if (command === 'simulate') return simulateInbound(args[0], options);
  if (command === 'worker') return worker(Boolean(options.once));
  throw new Error(`Comando desconhecido: ${command}`);
}

async function showLead(id) {
  const [lead] = await dbRequest('GET', 'sales_leads', { id: `eq.${id}`, limit: '1' });
  if (!lead) throw new Error('Lead não encontrado.');
  const messages = await dbRequest('GET', 'sales_messages', { lead_id: `eq.${id}`, order: 'created_at.asc', limit: '200' });
  const events = await dbRequest('GET', 'sales_automation_events', { lead_id: `eq.${id}`, order: 'created_at.asc', limit: '200' });
  return { lead, messages, events };
}

async function importLeads(file, dryRun) {
  required(file, 'Informe --file ou o caminho do arquivo JSON/CSV.');
  const rows = readLeadFile(file);
  if (dryRun) return { dry_run: true, count: rows.length, leads: rows.map(leadFromObject) };
  const created = [];
  for (const row of rows) created.push(await createSalesLead(leadFromObject(row)));
  return { count: created.length, leads: created };
}

function readLeadFile(file) {
  const text = readFileSync(file, 'utf8');
  if (/\.json$/i.test(file)) { const data = JSON.parse(text); return Array.isArray(data) ? data : data.leads || [data]; }
  const lines = text.split(/\r?\n/).filter(Boolean); const headers = splitCsv(lines.shift() || '');
  return lines.map((line) => Object.fromEntries(splitCsv(line).map((value, index) => [headers[index], value])));
}

function splitCsv(line) { return line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map((value) => value.trim().replace(/^\"|\"$/g, '').replace(/\"\"/g, '"')); }
function leadFromFlags(flags) { return leadFromObject(flags); }
function leadFromObject(data) { return { business_name: data.business_name || data.businessName || data.name, contact_name: data.contact_name || data.contactName, phone: data.phone, city: data.city, state: data.state || 'RS', segment: data.segment, instagram: data.instagram, source: data.source || 'manual', current_platform: data.current_platform || data.currentPlatform, apparent_activity: data.apparent_activity || data.apparentActivity, score: Number(data.score || 0), metadata: data.metadata || {} }; }

async function patchLead(id, payload) { const [row] = await dbRequest('PATCH', 'sales_leads', { id: `eq.${id}` }, { ...payload, updated_at: new Date().toISOString() }, ['Prefer: return=representation']); if (!row) throw new Error('Lead não encontrado.'); return row; }
async function processJobs(limit) { const results = []; const errors = []; for (let index = 0; index < limit; index += 1) { try { const job = await processNextSalesJob(); if (!job) break; results.push(job); } catch (error) { errors.push(error.message); } } return { processed: results.length, failed: errors.length, jobs: results, errors }; }
async function dueFollowups() { return dbRequest('GET', 'sales_leads', { automation_status: 'eq.active', next_followup_at: `lte.${new Date().toISOString()}`, order: 'next_followup_at.asc', limit: '100' }); }
async function resumeLead(id) { const [lead] = await dbRequest('GET', 'sales_leads', { id: `eq.${id}`, limit: '1' }); if (!lead) throw new Error('Lead não encontrado.'); if (lead.opted_out_at || ['opted_out','not_interested','won','lost'].includes(lead.stage)) throw new Error('Lead em estágio terminal não pode ser retomado.'); return patchLead(id, { stage: 'qualified', automation_status: 'active', stop_reason: null }); }

async function metrics() {
  const pool = getLocalPool();
  const result = await pool.query(`select (select count(*)::int from sales_leads) leads,(select count(*)::int from sales_messages where direction='outbound' and status='sent') contacts_sent,(select count(*)::int from sales_messages where direction='inbound') replies,(select count(*)::int from sales_leads where stage='demo_requested') demos,(select count(*)::int from sales_leads where stage='opted_out') opt_outs,(select count(*)::int from sales_leads where stage='human_handoff') handoffs,(select count(*)::int from sales_messages where status='failed') send_failures`);
  const data = result.rows[0]; data.reply_rate = data.contacts_sent ? Number((data.replies / data.contacts_sent * 100).toFixed(1)) : 0; return data;
}

async function simulateInbound(leadId, options) {
  const [lead] = await dbRequest('GET', 'sales_leads', { id: `eq.${required(leadId, 'Informe o ID do lead.')}`, limit: '1' });
  if (!lead?.normalized_phone) throw new Error('Lead precisa ter telefone para a simulação.');
  const config = salesConfig(); if (!config.storeId) throw new Error('SALES_WHATSAPP_STORE_ID não configurado.');
  const integration = await getStoreWhatsappIntegration(config.storeId); if (!integration) throw new Error('Integração comercial não encontrada.');
  return receiveSalesEvolutionMessage(integration, { event: 'MESSAGE', instance: integration.instance_name, data: { key: { id: `sim_${Date.now()}`, remoteJid: `${normalizeSalesPhone(lead.normalized_phone)}@s.whatsapp.net`, fromMe: false }, message: { conversation: options.body || 'Olá' }, messageType: 'text' } });
}

async function worker(once) {
  const config = salesConfig(); let processed = 0;
  do {
    await scheduleDueSalesFollowups();
    const result = await processJobs(20); processed += result.processed;
    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, config.workerIntervalSeconds * 1000));
  } while (true);
  return { processed };
}

function parseFlags(args) { const flags = {}; for (let i = 0; i < args.length; i += 1) { const arg = args[i]; if (!arg.startsWith('--')) continue; const [rawKey, inline] = arg.slice(2).split('=', 2); if (inline !== undefined) flags[rawKey] = inline; else if (args[i + 1] && !args[i + 1].startsWith('--')) flags[rawKey] = args[++i]; else flags[rawKey] = true; } return flags; }
function required(value, message) { if (!value) throw new Error(message); return value; }

const COMMANDS = ['status','provider:test','webhook:configure','outreach:queue','lead:create','lead:import','lead:list','lead:show','lead:pause','lead:resume','lead:opt-out','message:draft','message:approve','message:send','history','inbox:process','followups:run','handoff:list','automation:pause','automation:resume','metrics','simulate','worker'];
