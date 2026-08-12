import { spawn } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
const chrome = findChrome(); if (!chrome) throw new Error('Chrome ou Edge não encontrado.');
const port = 4950 + Math.floor(Math.random() * 100); const debugPort = port + 150;
const baseUrl = `http://127.0.0.1:${port}`; const profile = mkdtempSync(join(tmpdir(), 'tapronto-autopilot-ui-'));
const email = `autopilot-ui-${Date.now()}@tapronto.local`; const password = randomBytes(24).toString('base64url');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }); let server; let browser; let adminId = ''; let socialTestId = ''; let cdp; let previousReadyIds = []; let previousSettings = null;

try {
  adminId = (await pool.query(`insert into admin_users(name,email,password_hash,role,is_active) values('Autopilot UI Smoke',$1,$2,'superadmin',true) returning id`, [email, hashPassword(password)])).rows[0].id;
  socialTestId = (await pool.query(`insert into social_accounts(mode,provider_account_id,username,display_name,status,publishing_paused,connected_by) values('simulation',$1,'smoke_conta','Conta de teste','connected',false,$2) returning id`, [`ui-${Date.now()}`, adminId])).rows[0].id;
  previousSettings = (await pool.query(`select image_style,image_aspect_ratio,monthly_image_limit,topic_cooldown_days from marketing_autopilot_settings where id=1`)).rows[0];
  previousReadyIds = (await pool.query(`select id from marketing_autopilot_runs where run_date=(now() at time zone 'America/Sao_Paulo')::date and status='ready'`)).rows.map((row) => row.id);
  server = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), APP_URL: baseUrl, PUBLIC_APP_URL: baseUrl, COOKIE_SECURE: 'false', ADMIN_2FA_REQUIRED: 'false', OPENAI_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitFor(`${baseUrl}/api/health`);
  browser = spawn(chrome, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  await waitFor(`http://127.0.0.1:${debugPort}/json/version`);
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`${baseUrl}/platform`)}`, { method: 'PUT' })).json();
  cdp = createCdp(target.webSocketDebuggerUrl); await cdp.ready; await cdp.call('Page.enable'); await cdp.call('Runtime.enable'); await delay(900);
  const login = await evaluate(`fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:${JSON.stringify(email)},password:${JSON.stringify(password)}})}).then(r=>r.status)`);
  assert(login === 200, `Login retornou ${login}.`);
  await evaluate(`location.assign('/platform?view=marketing')`); await delay(2600);
  await evaluate(`document.querySelector('[data-platform-view="marketing"]')?.click()`); await delay(1200);
  const before = await pool.query(`select count(*)::int total from marketing_autopilot_runs where created_by=$1`, [adminId]);
  const clicked = await evaluate(`Boolean(document.querySelector('#generateDailyPostButton') && (document.querySelector('#generateDailyPostButton').click(), true))`);
  assert(clicked, 'Botão Preparar post de hoje não foi encontrado.');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await pool.query(`select status,content_id from marketing_autopilot_runs where created_by=$1 order by created_at desc limit 1`, [adminId]);
    if (result.rows[0]?.status === 'ready' && result.rows[0]?.content_id) break;
    await delay(250);
  }
  const after = await pool.query(`select status,content_id from marketing_autopilot_runs where created_by=$1 order by created_at desc limit 1`, [adminId]);
  assert(Number(before.rows[0].total) === 0 && after.rows[0]?.status === 'ready' && after.rows[0]?.content_id, 'Clique não criou uma publicação pronta.');
  await delay(700);
  const title = await evaluate(`document.querySelector('#autopilotTodayCard h3')?.textContent || ''`);
  assert(title && !/não foi preparado/i.test(title), 'A prévia não apareceu depois da geração.');
  const firstContentId = after.rows[0].content_id;
  const regenerated = await evaluate(`Boolean(document.querySelector('[data-autopilot-action="regenerate"]') && (document.querySelector('[data-autopilot-action="regenerate"]').click(), true))`);
  assert(regenerated, 'Botão Gerar outra opção não foi encontrado.');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await pool.query(`select status,content_id from marketing_autopilot_runs where created_by=$1 order by created_at desc limit 1`, [adminId]);
    if (result.rows[0]?.status === 'ready' && result.rows[0]?.content_id !== firstContentId) break;
    await delay(250);
  }
  const versions = await pool.query(`select status,content_id from marketing_autopilot_runs where created_by=$1 order by variant`, [adminId]);
  assert(versions.rows.length === 2 && versions.rows[0].status === 'discarded' && versions.rows[0].content_id === firstContentId && versions.rows[1].status === 'ready', 'A nova geração não preservou a versão anterior.');
  await delay(600);
  const restoreButton = await evaluate(`Boolean(document.querySelector('[data-autopilot-action="select"]'))`);
  assert(restoreButton, 'O controle para voltar à versão anterior não apareceu.');
  await evaluate(`document.querySelector('[data-marketing-tab="more"]').click()`); await delay(400);
  const settingsSaved = await evaluate(`(() => { const f=document.querySelector('#autopilotSettingsForm'); f.elements.image_style.value='before_after'; f.elements.image_aspect_ratio.value='4:5'; f.elements.monthly_image_limit.value='37'; f.elements.topic_cooldown_days.value='9'; f.requestSubmit(); return true; })()`);
  assert(settingsSaved, 'Formulário de configurações não foi encontrado.'); await delay(700);
  const updatedSettings = (await pool.query(`select image_style,image_aspect_ratio,monthly_image_limit,topic_cooldown_days from marketing_autopilot_settings where id=1`)).rows[0];
  assert(updatedSettings.image_style === 'before_after' && updatedSettings.image_aspect_ratio === '4:5' && updatedSettings.monthly_image_limit === 37 && updatedSettings.topic_cooldown_days === 9, 'Configurações do estúdio não foram persistidas.');
  const disconnected = await evaluate(`(() => { window.confirm=()=>true; const b=document.querySelector('[data-social-action="disconnect"]'); if(!b) return false; b.click(); return true; })()`);
  assert(disconnected, 'Botão Desconectar não foi encontrado.');
  for (let attempt = 0; attempt < 20; attempt += 1) { const row = (await pool.query('select status from social_accounts where id=$1', [socialTestId])).rows[0]; if (row?.status === 'disconnected') break; await delay(200); }
  assert((await pool.query('select status from social_accounts where id=$1', [socialTestId])).rows[0]?.status === 'disconnected', 'A conta não foi desconectada pela interface.');
  await evaluate(`document.querySelector('[data-marketing-tab="contents"]').click()`); await delay(400);
  const repurposed = await evaluate(`(() => { const b=document.querySelector('[data-marketing-repurpose]'); if(!b) return {status:0}; return fetch('/api/platform/marketing/content/'+b.dataset.marketingRepurpose+'/repurpose',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(async r=>({status:r.status,body:await r.text()})); })()`);
  assert(repurposed.status === 201, `Ação Reaproveitar falhou: ${JSON.stringify(repurposed)}`);
  let derived;
  for (let attempt = 0; attempt < 20; attempt += 1) { derived = await pool.query(`select count(*)::int total from marketing_content_items where created_by=$1 and format in ('carousel','reel','story')`, [adminId]); if (derived.rows[0].total >= 3) break; await delay(200); }
  assert(derived.rows[0].total >= 3, 'O reaproveitamento não criou carrossel, Reel e Stories.');
  console.log('Marketing autopilot UI smoke: OK');
} finally {
  cdp?.close(); browser?.kill(); server?.kill();
  if (adminId) {
    const ids = (await pool.query('select content_id from marketing_autopilot_runs where created_by=$1', [adminId]).catch(() => ({ rows: [] }))).rows.map((row) => row.content_id).filter(Boolean);
    await pool.query('delete from marketing_autopilot_runs where created_by=$1', [adminId]).catch(() => {});
    if (previousReadyIds.length) await pool.query(`update marketing_autopilot_runs set status='ready',updated_at=now() where id=any($1::uuid[]) and status='discarded'`, [previousReadyIds]).catch(() => {});
    if (previousSettings) await pool.query(`update marketing_autopilot_settings set image_style=$1,image_aspect_ratio=$2,monthly_image_limit=$3,topic_cooldown_days=$4,updated_at=now() where id=1`, [previousSettings.image_style, previousSettings.image_aspect_ratio, previousSettings.monthly_image_limit, previousSettings.topic_cooldown_days]).catch(() => {});
    if (ids.length) await pool.query('delete from marketing_content_items where id=any($1::uuid[])', [ids]).catch(() => {});
    if (socialTestId) await pool.query('delete from social_accounts where id=$1', [socialTestId]).catch(() => {});
    await pool.query('delete from admin_users where id=$1', [adminId]).catch(() => {});
  }
  await pool.end(); rmSync(profile, { recursive: true, force: true });
}

async function evaluate(expression) { const result = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return result.result?.value; }
function assert(condition, message) { if (!condition) throw new Error(message); }
function createCdp(url) { const socket = new WebSocket(url); let id = 0; const pending = new Map(); socket.onmessage = (event) => { const message = JSON.parse(event.data); if (!message.id) return; const task = pending.get(message.id); if (!task) return; pending.delete(message.id); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); }; return { ready: new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; }), call(method, params = {}) { const callId = ++id; socket.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { socket.close(); } }; }
function findChrome() { return ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync) || ''; }
async function waitFor(url) { for (let i = 0; i < 80; i += 1) { try { if ((await fetch(url)).ok) return; } catch {} await delay(250); } throw new Error(`Tempo esgotado: ${url}`); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function hashPassword(value) { const salt = randomBytes(16).toString('hex'); const iterations = 310000; return `pbkdf2_sha256$${iterations}$${salt}$${pbkdf2Sync(value, salt, iterations, 32, 'sha256').toString('hex')}`; }
function loadEnv(url) { if (!existsSync(url)) return; for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) { const value = line.trim(); if (!value || value.startsWith('#') || !value.includes('=')) continue; const index = value.indexOf('='); const key = value.slice(0, index).trim(); if (!(key in process.env)) process.env[key] = value.slice(index + 1).trim().replace(/^['"]|['"]$/g, ''); } }
