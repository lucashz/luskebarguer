import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const port = 4400 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;
const surface = `smoke_${randomUUID().slice(0, 8)}`;
let experimentId = '';
let child;

try {
  const platformHtml = readFileSync(new URL('../public/platform.html', import.meta.url), 'utf8');
  const platformJs = readFileSync(new URL('../public/platform.js', import.meta.url), 'utf8');
  for (const label of ['Hoje', 'Publicações', 'Agenda', 'Resultados', 'Configurações']) assert(platformHtml.includes(`>${label}</button>`), `Navegação de marketing não inclui ${label}.`);
  assert((platformHtml.match(/id="marketingContentList"/g) || []).length === 1, 'Existe mais de uma biblioteca editorial visível.');
  assert(platformHtml.includes('id="marketingNextAction"') && platformJs.includes('renderMarketingOverview'), 'Próxima ação do marketing não foi implementada.');
  assert(platformJs.includes('marketingStatusLabel') && platformJs.includes("Aguardando aprovação"), 'Estados editoriais não estão traduzidos.');
  const schema = await pool.query(`
    select
      to_regclass('public.marketing_experiment_assignments') assignments,
      to_regclass('public.marketing_pilot_stores') pilots,
      to_regclass('public.marketing_weekly_reports') reports
  `);
  assert(schema.rows[0].assignments && schema.rows[0].pilots && schema.rows[0].reports, 'Tabelas da operação de crescimento ausentes.');

  const content = await pool.query(`
    select
      count(*) filter (where channel <> 'blog' and script <> '' and caption <> '' and jsonb_array_length(scenes) > 0 and cardinality(hashtags) > 0 and jsonb_array_length(assets) > 0 and utm_url <> '') complete,
      count(*) filter (where is_pinned) pinned,
      count(*) filter (where channel = 'blog' and status = 'idea') seo
    from marketing_content_items
  `);
  assert(Number(content.rows[0].complete) >= 30, 'Calendário editorial não está completo.');
  assert(Number(content.rows[0].pinned) >= 3, 'Conteúdos fixados ausentes.');
  assert(Number(content.rows[0].seo) >= 18, 'Backlog SEO incompleto.');

  const inserted = await pool.query(`
    insert into marketing_experiments (name,hypothesis,surface,audience,variant_a,variant_b,primary_kpi,status,traffic_percentage,minimum_sample)
    values ($1,$2,$3,$4,$5,$6,$7,'running',100,10) returning id
  `, ['Smoke A/B', 'Distribuir visitantes com persistência.', surface, '#smoke', 'Controle', 'Variação', 'smoke_click']);
  experimentId = inserted.rows[0].id;
  child = await startServer();

  const assignedResponse = await fetch(`${baseUrl}/api/experiments/assignment?surface=${surface}`, { headers: { Host: 'taprontomenu.com.br', Cookie: 'tapronto_attribution=eyJ2aXNpdG9yX2tleSI6InNtb2tlLXZpc2l0b3IifQ' } });
  const assigned = await assignedResponse.json();
  assert(assignedResponse.ok && assigned.assignment?.experiment_id === experimentId, 'Motor A/B não atribuiu a variação ativa.');

  for (const event of ['exposure', 'conversion']) {
    const response = await fetch(`${baseUrl}/api/experiments/event`, { method: 'POST', headers: { 'Content-Type': 'application/json', Host: 'taprontomenu.com.br' }, body: JSON.stringify({ assignment_id: assigned.assignment.id, event, conversion_event: 'smoke_click' }) });
    assert(response.ok, `Evento ${event} do experimento falhou.`);
  }
  const result = await pool.query('select exposed_at,converted_at from marketing_experiment_assignments where id = $1', [assigned.assignment.id]);
  assert(result.rows[0]?.exposed_at && result.rows[0]?.converted_at, 'Exposição ou conversão não foi persistida.');
  console.log('Marketing growth smoke: OK');
} finally {
  if (child && child.exitCode === null) child.kill();
  if (experimentId) await pool.query('delete from marketing_experiments where id = $1', [experimentId]).catch(() => {});
  await pool.end();
}

async function startServer() {
  const processChild = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), COOKIE_SECURE: 'false', ADMIN_2FA_REQUIRED: 'false', APP_URL: baseUrl, PUBLIC_APP_URL: 'https://taprontomenu.com.br' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  processChild.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  processChild.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (processChild.exitCode !== null) throw new Error(`Servidor encerrou durante o boot.\n${logs}`);
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return processChild; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  processChild.kill();
  throw new Error(`Servidor não respondeu.\n${logs}`);
}

function assert(condition, message) { if (!condition) throw new Error(message); }

function loadEnv(url) {
  if (!existsSync(url)) return;
  for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] ||= rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
}
